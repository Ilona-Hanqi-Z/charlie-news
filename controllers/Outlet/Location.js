'use strict';

const _ = require('lodash');
const Promise = require('bluebird');

const ferror = require('../../lib/frescoerror');
const reporter = require('../../lib/reporter');

const OutletLocation = require('../../models/outlet_location');
const OutletLocationNotificationSetting = require('../../models/outlet_location_notification_setting');
const Post = require('../../models/post');

const config = require('../../config');

class OutletLocationController {

    /**
     * Takes the location(s) and formats them for serving,
     * returning the proper columns and relations for each.
     * 
     * @param user_model {bookshelf.Model}
     * @param location_models {bookshelf.Model|bookshelf.Model[]}
     * @param options {object}
     * @param options.filter {string[]}
     * @param options.keep_fields {string[]} optional, fields to ignore when filtering attributes
     * @param options.show_settings {bool}
     * @param options.show_unseen_since {Date}
     * @param trx {knex.Transaction}
     * 
     * @returns Promise
     */
    build(user_model, location_models, {
        filter = OutletLocation.FILTERS.PUBLIC,
        keep_fields = [],
        show_unseen_since = false,
        show_settings = false,
        trx
    } = {}) {
        if (!location_models) return Promise.resolve();

        let isArr = true;
        if (!_.isArray(location_models)) {
            isArr = false;
            location_models = [location_models];
        }
        if (location_models.length === 0) return Promise.resolve(location_models);

        let references = {
            locations: { map: {}, ids: [] },
            settings: { ids: [] },
        };

        // Build array for resolving all relations at same time, also init each model
        for (let location_model of location_models) {
            // Model init
            location_model.columns(filter.concat(keep_fields));
            location_model.trigger('fetched', location_model);

            references.locations.ids.push(location_model.get('id'));
            references.locations.map[location_model.get('id')] = location_model;

            if (show_settings) {
                if (location_model.relations.settings && !location_model.relations.settings.isEmpty()) {
                    location_model.relations.settings.columns(OutletLocationNotificationSetting.FILTERS.SETTINGS);
                } else {
                    location_model.relations.settings = new OutletLocationNotificationSetting({
                        send_email: location_model.get('send_email_default'),
                        send_fresco: location_model.get('send_fresco_default'),
                        send_push: location_model.get('send_push_default'),
                        send_sms: location_model.get('send_sms_default')
                    });

                    references.settings.ids.push(location_model.get('id'))
                }
            } else {
                delete location_model.relations.settings;
            }

            if (show_unseen_since) {
                location_model.set('unseen_count', 0);
            } else {
                location_model.unset('unseen_count');
            }
        }

        return Promise
            .all([
                // Settings promise
                new Promise((yes, no) => {
                    if (!show_settings) return yes();

                    OutletLocationNotificationSetting.knex.from('outlet_location_notification_settings')
                        .whereIn('location_id', references.settings.ids)
                        .where('user_id', user_model.get('id'))
                        .limit(references.settings.ids.length)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                references.locations.map[row.location_id].relations.settings = 
                                    new OutletLocationNotificationSetting(row).columns(OutletLocationNotificationSetting.FILTERS.SETTINGS);
                            }
                            yes();
                        })
                        .catch(ferror.constraint(no));
                }),
                // Unseen count promise
                new Promise((yes, no) => {
                    if (!show_unseen_since) return yes();

                    OutletLocation.knex.from('outlet_locations')
                        .select('outlet_locations.id')
                        .count('posts.*').as('unseen_count')
                        .innerJoin('posts', function() {
                            this.on(Post.knex.raw('ST_Intersects(outlet_locations.location, posts.location)'));
                        })
                        .where('posts.created_at', '>', show_unseen_since)
                        .groupBy('outlet_locations.id')
                        .where(qb => Post.QUERIES.VISIBLE(qb, { user: user_model }))
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                references.locations.map[row.id].set('unseen_count', row.unseen_count);
                            }
                            yes();
                        })
                        .catch(ferror.constraint(no));
                }),
            ])
            .then(() => Promise.resolve(isArr ? location_models : location_models[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Used to alert any intersecting outlet locations about the new contentAlert
     * 
     * @param post_model {bookshelf.Model}
     * @param trx {knex.Transaction}
     */
    contentAlert(post_model, trx) {
        if (_.isArray(post_model)) return Promise.each(post_model, p => this.contentAlert(p, trx)) // support multiple posts
        if (!post_model.has('location')) return Promise.resolve();
        return OutletLocation
            .query(qb => {
                qb.whereRaw(
                    'ST_Intersects(??.??, ST_geomFromGeoJSON(?))',
                    ['outlet_locations', 'location', JSON.stringify(post_model.get('location'))]
                );
            })
            .fetchAll({ transacting: trx })
            .then(location_collection => {
                let outlet_locations = {};
                for (let location of location_collection.models) {
                    let outlet_id = location.get('outlet_id');
                    if (outlet_locations[outlet_id]) {
                        outlet_locations[outlet_id].push(location.get('id'));
                    }
                    else {
                        outlet_locations[outlet_id] = [location.get('id')];
                    }
                }

                let mergedLocations = [];
                for (let outlet_id in outlet_locations) {
                    mergedLocations.push(outlet_locations[outlet_id]);
                }

                return Promise.each(mergedLocations, notify);
            })
            .catch(err => Promise.reject(ferror.constraint(err)));

        function notify(location_ids) {
            let key = location_ids.join('|');
            return NotificationController.Mediums.Delayed
                .send({
                    type: 'outlet-location-content',
                    key,
                    delay: config.APPLICATION.DELAYS.CONTENT, // 10 min
                    fields: {
                        location_ids: location_ids,
                        photo_count: post_model.has('video') ? 0 : 1,
                        video_count: post_model.has('video') ? 1 : 0,
                        post_ids: [post_model.get('id')]
                    },
                    behaviors: {
                        $inc: ['photo_count', 'video_count'],
                        $push: ['post_ids']
                    }
                })
                .catch(reporter.report);
        }
    }

    /**
     * Create a new outlet location
     * 
     * user_model {Model} user making request
     * params {object}
     * params.title {string}
     * params.location {geoJSON}
     */
    create(user_model, { title, geo, send_email_default, send_sms_default, send_fresco_default, send_push_default, settings } = {}, trx) {
        return new Promise((resolve, reject) => {
            const _this = this;
            const params = {
                outlet_id: user_model.related('outlet').get('id'),
                title,
                location: geo
            };

            if (send_email_default != null) params.send_email_default = send_email_default;
            if (send_fresco_default != null) params.send_fresco_default = send_fresco_default;
            if (send_push_default != null) params.send_push_default = send_push_default;
            if (send_sms_default != null) params.send_sms_default = send_sms_default;

            OutletLocation
                .forge(params)
                .save(null, {
                    method: 'insert',
                    transacting: trx
                })
                .then(l => l.fetch({
                    columns: OutletLocation.GEO_FILTERS.PUBLIC,
                    transacting: trx
                }))
                .then(buildSettings)
                .then(resolve)
                .catch(ferror.constraint(reject));

            function buildSettings(location_model) {
                if (settings) {
                    return _this.updateSetting(user_model, { location_model, settings }, trx);
                } else {
                    location_model.relations.settings = new OutletLocationNotificationSetting({
                        send_email: location_model.get('send_email_default'),
                        send_fresco: location_model.get('send_fresco_default'),
                        send_push: location_model.get('send_push_default'),
                        send_sms: location_model.get('send_sms_default')
                    });
                }

                return location_model;
            }
        });
    }

    /**
     * Delete the provided outlet location
     * 
     * user_model {Model}
     * loc_id {int}
     * _trx {Transaction} optional
     */
    delete(user_model, loc_id, _trx) {
        return new Promise((resolve, reject) => {
            let query = {
                id: loc_id
            };
            
            // If user doesn't have admin rights, only allow them to manage their own locations
            if (!user_model.can('admin', 'delete', 'outlet-location')) {
                query.outlet_id = user_model.related('outlet').get('id');
            }

            OutletLocation
                .where(query)
                .destroy({ require: true, transacting: _trx })
                .then(r => resolve({ success: 'ok' }))
                .catch(ferror(ferror.NOT_FOUND).trip(reject))
                .catch(ferror.constraint(reject));
        });
    }

    /**
     * Get one or many outlet locations
     * 
     * user_model {Model}
     * options {object}
     * options.outlet_id {int} optional, admin only for outlet_id != user.outlet.id
     * options.loc_id {int} optional, returns object instead of arr
     * options.since {datetime} optional, return unseen count for location since this time
     * options.sortBy {string}
     * options.direction {asc|desc}
     * options.last {int}
     * options.limit {int}
     */
    get(user_model, { outlet_id, loc_id, since, sortBy = 'id', direction = 'desc', last, page, limit = 20 } = {}) {
        return new Promise((resolve, reject) => {
            if (!user_model.can('admin', 'get', 'outlet-location')
                && (
                    (outlet_id && outlet_id != user_model.related('outlet').get('id'))
                    || user_model.related('outlet').isNew()
                )
            ) {
                return reject(ferror(ferror.FORBIDDEN));
            } else if (user_model.related('outlet').isNew() && !outlet_id) {
                return reject(ferror(ferror.INVALID_REQUEST).msg('Missing outlet'));
            }

            OutletLocation
                .query(qb =>  {
                    qb.select(...OutletLocation.GEO_FILTERS.PUBLIC);
                    qb.where('outlet_id', outlet_id || user_model.related('outlet').get('id'));

                    // If a specific location ID is passed, just resolve that
                    if (loc_id) {
                        qb.where('id', loc_id);
                        qb.limit(1);
                    } else { // otherwise paginate
                        OutletLocation.paginate(qb, { sortBy, direction, last, page, limit });
                    }
                })
                .fetchAll()
                .then(collection => {
                    if (loc_id && !collection.length) {
                        reject(ferror(ferror.NOT_FOUND).msg('Outlet location not found'));
                    } else {
                        resolve(loc_id ? collection.models[0] : collection.models);
                    }
                })
                .catch(ferror.constraint(reject));
        });
    }

    /**
     * Get the posts which havent been seen by the given outlet location since the given time
     * 
     * @param user_model {Model}
     * @param loc_id {int}
     * @param options {object}
     * @param options.since {datetime}
     * @param options.sortBy {string}
     * @param options.direction {asc|desc}
     * @param options.last {int}
     * @param options.limit {int}
     */
    posts(user_model, loc_id, { since, sortBy = 'created_at', direction = 'asc', last, page, limit } = {}) {
        return new Promise((resolve, reject) => {
            OutletLocation
                .forge({ id: loc_id })
                .fetch({ require: true })
                .catch(OutletLocation.NotFoundError, ferror(ferror.NOT_FOUND).msg('Location not found').trip(reject))
                .then(l => 
                    Post.query(qb => {
                        qb.select(Post.GEO_FILTERS.PUBLIC);
                        qb.where('created_at', '>', since);
                        qb.whereRaw(
                            'ST_Intersects(posts.location, ST_geomFromGeoJSON(?))',
                            [JSON.stringify(l.get('location'))]
                        );
                        Post.QUERIES.VISIBLE(qb, { user: user_model });
                        Post.paginate(qb, { sortBy, direction, last, page, limit });
                    })
                    .fetchAll()
                )
                .then(coll => resolve(coll.models))
                .catch(ferror.constraint(reject));
        });
    }

    /**
     * Update an outlet location
     * 
     * @param user_model {bookshelf.Model}
     * @param location_id {Integer}
     * @param updates {Object}
     * @param updates.title {String}
     * @param updates.geo {GeoJSON}
     * 
     * @returns {Promise}
     */
    update(user_model, location_id, updates = {}, trx) {
        return new Promise((resolve, reject) => {
            if (_.isEmpty(updates)) {
                return reject(ferror(ferror.INVALID_REQUEST).msg('No updates provided'));
            }

            // TODO why
            if (updates.geo) {
                updates.location = updates.geo;
                delete updates.geo;
            }

            OutletLocation
                .forge({ id: location_id })
                .fetch({
                    require: true,
                    columns: OutletLocation.GEO_FILTERS.PUBLIC,
                    transacting: trx
                })
                .catch(OutletLocation.NotFoundError, ferror(ferror.NOT_FOUND).trip(reject))
                .then(l => l.save(updates, { patch: true, method: 'update', transacting: trx }))
                .then(resolve)
                .catch(ferror.constraint(reject));
        });
    }

    /**
     * Update the user's custom notif settings for this outlet location
     * 
     * @param user_model {bookshelf.Model}
     * @param location_id {int}
     * @param settings {Object}
     * @param settings.send_email {boolean}
     * @param settings.send_fresco {boolean}
     * @param settings.send_push {boolean}
     * @param settings.send_sms {boolean}
     * @param trx {knex.Transaction}
     * 
     * @returns {Promise}
     */
    updateSetting(user_model, { location_model, location_id, settings = {} }, trx) {
        return new Promise((resolve, reject) => {
            let location;

            if (location_model) {
                location = location_model;

                if (location.related('settings').isEmpty()) {
                    gotLocation();
                } else {
                    location
                        .related('settings')
                        .where('user_id', user_model.get('id'))
                        .fetch({ transacting: trx })
                        .then(gotLocation)
                        .catch(ferror.constraint(reject));
                }
            } else {
                location = OutletLocation.forge({
                    id: location_id,
                    outlet_id: user_model.related('outlet').get('id')
                });
            }

            location
                .fetch({
                    require: true,
                    columns: OutletLocation.GEO_FILTERS.PUBLIC,
                    transacting: trx,
                    withRelated: {
                        settings: qb => {
                            qb.where('user_id', user_model.get('id'));
                        }
                    }
                })
                .then(gotLocation)
                .catch(OutletLocation.NotFoundError, ferror(ferror.NOT_FOUND).msg('Outlet location not found').trip(reject))
                .catch(ferror.constraint(reject));

            function gotLocation() {
                if (location.related('settings').isEmpty()) {
                    insertSetting();
                } else {
                    updateSetting(location.related('settings'));
                }
            }

            function insertSetting() {
                let setting = new OutletLocationNotificationSetting({
                    user_id: user_model.get('id'),
                    location_id: location.get('id'),
                    send_email: settings.send_email == null ? location.get('send_email_default') : settings.send_email,
                    send_fresco: settings.send_fresco == null ? location.get('send_fresco_default') : settings.send_fresco,
                    send_push: settings.send_push == null ? location.get('send_push_default') : settings.send_push,
                    send_sms: settings.send_sms == null ? location.get('send_sms_default') : settings.send_sms
                });
                location.relations.settings = setting;

                setting
                    .save(null, { method: 'insert', transacting: trx })
                    .then(s => s.columns(OutletLocationNotificationSetting.FILTERS.SETTINGS))
                    .then(done)
                    .catch(ferror.constraint(reject));
            }

            function updateSetting(old_setting) {
                OutletLocationNotificationSetting
                    .where({
                        user_id: user_model.get('id'),
                        location_id: location.get('id')
                    })
                    .save(settings, {
                        patch: true,
                        method: 'update',
                        transacting: trx
                    })
                    .then(s => {
                        Object.assign(location.related('settings').attributes, s.attributes);
                        location.related('settings').columns(OutletLocationNotificationSetting.FILTERS.SETTINGS);
                    })
                    .then(done)
                    .catch(ferror.constraint(reject));
            }

            function done() {
                resolve(location);
            }
        });
    }

    /**
     * Get the location notification settings for this user
     * 
     * @param user_model {bookshelf.Model}
     * @param location_id {int} optional
     * @param trx {knex.Transaction} optional
     * 
     * @returns {Promise}
     */
    getSettings(user_model, location_id, trx) {
        return new Promise((resolve, reject) => {
            OutletLocation
                .query(qb => {
                    qb.select(OutletLocation.GEO_FILTERS.PUBLIC);
                    qb.where('outlet_id', user_model.related('outlet').get('id'));
                    if (location_id) qb.where('id', location_id);
                })
                .fetchAll({
                    require: !!location_id,
                    transacting: trx,
                    withRelated: {
                        settings: qb => {
                            qb.where('user_id', user_model.get('id'));
                        }
                    }
                })
                .then(coll => coll.models.map(l => {
                    l.trigger('fetched', l);
                    if (l.related('settings').isEmpty()) {
                        l.related('settings').set('send_email', l.get('send_email_default'));
                        l.related('settings').set('send_fresco', l.get('send_fresco_default'));
                        l.related('settings').set('send_push', l.get('send_push_default'));
                        l.related('settings').set('send_sms', l.get('send_sms_default'));
                    } else {
                        l.related('settings').columns(OutletLocationNotificationSetting.FILTERS.SETTINGS);
                    }
                    return l;
                }))
                .then(locations => resolve(location_id ? locations[0] : locations))
                .catch(OutletLocation.NotFoundError, ferror(ferror.NOT_FOUND).msg('Outlet location not found').trip(reject))
                .catch(ferror.constraint(reject));
        });
    }
}

module.exports = new OutletLocationController;

const NotificationController = require('../Notification');