'use strict';

const _ = require('lodash');
const Promise = require('bluebird');

const config = require('../../config');

const ferror = require('../../lib/frescoerror');
const hashids = require('../../lib/hashids');
const scheduler = require('../../lib/scheduler');
const reporter = require('../../lib/reporter');
const constants = require('../../lib/constants');

const Assignment = require('../../models/assignment');
const Gallery = require('../../models/gallery');
const Outlet = require('../../models/outlet');
const Post = require('../../models/post');
const Purchase = require('../../models/purchase');
const User = require('../../models/user');

class AssignmentController {

    /**
     * Attaches stats and social fields to assignment(s)
     *
     * @param user_model
     */
    build(user_model, assignments, {
        filter = Assignment.FILTERS.PUBLIC,
        keep_fields = [],
        post_rating,
        show_outlets = false,
        show_curator = false,
        show_thumbs = false,
        show_stats = false,

        build_outlets = {},
        build_curator = {},
        build_thumbs = {},

        trx
    } = {}) {
        if (!assignments) return Promise.resolve();

        let isArr = true;
        if(!_.isArray(assignments)) {
            isArr = false;
            assignments = [assignments];
        }
        if (assignments.length === 0) return Promise.resolve(assignments);

        let references = {
            assignments: { map: {}, ids: [] },
            curators: { build: [], map: {}, ids: [] },
            outlets: { build: [], ids: [] },
            thumbs: { build: [], ids: [] }
        };

        for (let assignment of assignments) {
            let _assignment_id = assignment.get('id');
            let _curator_id = assignment.get('curator_id');

            assignment.columns(filter.concat(keep_fields));
            assignment.trigger('fetched', assignment);

            // TODO This should preferrably be removed and defined within the api bridge, or have clients handle it
            if (assignment.has('radius')) {
                assignment.set('radius', +(parseFloat(assignment.get('radius') / constants.METERS_PER_MILE).toFixed(2)));
            }

            references.assignments.ids.push(_assignment_id);
            references.assignments.map[_assignment_id] = assignment;

            // NOTE defauls are set below because if assignments have no results
            // in the corresponding query, they will not be included in the
            // query results

            if (show_curator) {
                if (assignment.relations.curator) {
                    references.curators.build.push(assignment.relations.curator);
                } else {
                    assignment.relations.curator = User.nullable();

                    if (_curator_id) {
                        if (!references.curators.map[_curator_id]) {
                            references.curators.map[_curator_id] = [assignment];
                            references.curators.ids.push(_curator_id);
                        } else {
                            references.curators.map[_curator_id].push(assignment);
                        }
                    }
                }
            } else {
                delete assignment.relations.curator;
            }
            if (show_outlets) {
                if (assignment.relations.outlets) {
                    references.outlets.build = references.outlets.build.concat(assignment.relations.outlets.models);
                } else {
                    assignment.relations.outlets = Outlet.Collection.forge();
                    references.outlets.ids.push(_assignment_id);
                }
            } else {
                delete assignment.relations.outlets;
            }
            if (show_thumbs) {
                if (assignment.relations.thumbnails) {
                    references.thumbs.build = references.thumbs.build.concat(assignment.relations.thumbnails.models);
                } else {
                    assignment.relations.thumbnails = Post.Collection.forge();
                    references.thumbs.ids.push(_assignment_id);
                }
            } else {
                delete assignment.relations.thumbnails;
            }
            if (show_stats) {
                // Set default stats
                assignment.set('photo_count', 0);
                assignment.set('video_count', 0);
                assignment.set('accepted_count', 0);
                if (user_model) {
                    assignment.set('accepted', false);
                }
            } else {
                assignment.unset('photo_count');
                assignment.unset('video_count');
                assignment.unset('accepted_count');
                assignment.unset('accepted');
            }
        }

        if (!user_model || !user_model.can('admin', 'get', 'assignment')) {
            post_rating = Post.RATING.VERIFIED;
        }

        return Promise
            .all([
                // Outlets promise
                new Promise((yes, no) => {
                    if (!show_outlets) return yes();

                    let qb = Outlet.knex
                        .from('outlets')
                        .select('*', Outlet.knex.raw('assignment_outlets.created_at AS created_at'), Post.knex.raw('ROW_NUMBER() OVER (PARTITION BY assignment_id ORDER BY assignment_outlets.created_at DESC) AS _rownum'))
                        .innerJoin('assignment_outlets', function() {
                            this.on(Post.knex.raw(
                                'assignment_outlets.outlet_id = outlets.id AND assignment_outlets.assignment_id = ANY(?)',
                                [references.outlets.ids]
                            ))
                        });

                    Outlet
                        .knex.raw(`
                            SELECT * FROM (${qb.toString()}) tmp WHERE _rownum <= 8
                        `)
                        .transacting(trx)
                        .then(({ rows = [] } = {}) => {
                            for (let row of rows) {
                                let _outlet = Outlet.forge(row);
                                references.assignments.map[row.assignment_id].relations.outlets.push(_outlet);
                                references.outlets.build.push(_outlet);
                            }

                            OutletController
                                .build(user_model, references.outlets.build, Object.assign({
                                    filter: Outlet.FILTERS.PREVIEW,
                                    trx
                                }, build_outlets))
                                .then(yes)
                                .catch(no);
                        }).catch(no);
                }),
                // Curators promise
                new Promise((yes, no) => {
                    if (!show_curator) return yes();

                    User.knex
                        .from('users')
                        .select(User.FILTERS.PREVIEW)
                        .whereIn('id', references.curators.ids)
                        .where(qb => User.QUERIES.ACTIVE(qb))
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _curator = User.forge(row);
                                references.curators.map[row.id].forEach(assignment => assignment.relations.curator = _curator);
                                references.curators.build.push(_curator);
                            }

                            UserController
                                .build(user_model, references.curators.build, Object.assign({
                                    filter: User.FILTERS.PREVIEW,
                                    trx
                                }, build_curator))
                                .then(yes)
                                .catch(no);
                        }).catch(no);
                }),
                // Thumbnails promise
                new Promise((yes, no) => {
                    if (!show_thumbs) return yes();

                    let qb = Post.knex
                        .from('posts')
                        .select(...Post.FILTERS.THUMBNAIL, 'assignment_id', Post.knex.raw('ROW_NUMBER() OVER (PARTITION BY assignment_id ORDER BY posts.created_at DESC) AS _rownum'))
                        .whereIn('assignment_id', references.thumbs.ids)
                        .where(_qb => Post.QUERIES.VISIBLE(_qb, { user: user_model, rating: post_rating }));

                    Post.knex
                        .raw(`
                            SELECT * FROM (${qb.toString()}) tmp WHERE _rownum <= 8
                        `)
                        .transacting(trx)
                        .then(({ rows = [] } = {}) => {
                            for (let row of rows) {
                                let _post = Post.forge(row);
                                references.assignments.map[row.assignment_id].relations.thumbnails.push(_post);
                                references.thumbs.build.push(_post);
                            }

                            PostController
                                .build(references.thumbs.build, Object.assign({
                                    user: user_model,

                                    filter: Post.FILTERS.THUMBNAIL,
                                    rating: post_rating,
                                    trx
                                }, build_thumbs))
                                .then(yes)
                                .catch(no);
                        }).catch(no);
                }),
                // Post stats fields
                new Promise((yes, no) => {
                    if (!show_stats) return yes();

                    Post.knex
                        .from('posts')
                        .select(
                            'assignment_id',
                            Post.knex.raw('SUM(CASE WHEN video IS NULL THEN 1 ELSE 0 END) AS photo_count'),
                            Post.knex.raw('SUM(CASE WHEN video IS NOT NULL THEN 1 ELSE 0 END) AS video_count')
                        )
                        .whereIn('assignment_id', references.assignments.ids)
                        .groupBy('assignment_id')
                        .where(qb => Post.QUERIES.VISIBLE(qb, { user: user_model, rating: post_rating }))
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let a = references.assignments.map[row.assignment_id];
                                a.set('photo_count', parseInt(row.photo_count, 0));
                                a.set('video_count', parseInt(row.video_count, 0));
                            }
                            yes();
                        }).catch(no);
                }),
                // Accepted stats fields
                new Promise((yes, no) => {
                    if (!show_stats) return yes();

                    Assignment.knex
                        .raw(`
                            SELECT
                                assignment_id,
                                COUNT(*) AS accepted_count,
                                ARRAY_AGG(user_id) AS user_ids
                            FROM assignment_users
                            WHERE assignment_id = ANY(?)
                            GROUP BY assignment_id;
                        `, [references.assignments.ids])
                        .transacting(trx)
                        .then(({ rows = [] } = {}) => {
                            for (let row of rows) {
                                let a = references.assignments.map[row.assignment_id];
                                a.set('accepted_count', parseInt(row.accepted_count, 0));

                                if (user_model) {
                                    a.set('accepted', row.user_ids.includes(user_model.get('id')));
                                }
                            }
                            yes();
                        })
                        .catch(no);
                }),
            ])
            .then(() => Promise.resolve(isArr ? assignments : assignments[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Creates new assignment
     *
     * NOTE: All params are required.
     *
     * @param params.address
     * @param params.title
     * @param params.caption
     * @param params.location
     * @param params.starts_at
     * @param params.ends_at
     * @returns {bluebird|Promise}
     */
    create(user_model, params, trx) {
        let _this = this;

        params.creator_id = user_model.get('id');

        return new Promise((resolve, reject) => {
            if(!user_model.related('outlet') || user_model.related('outlet').isNew()) {
                return reject(ferror(ferror.FORBIDDEN).msg(`You can't create assignment without an outlet!`));
            }

            //Check if user has permissions to pre-set the assignment's rating
            if(params.rating != null && !user_model.can('admin', 'create', 'assignment')) {
                return reject(ferror(ferror.FORBIDDEN).msg(`You can't create an assignment with a pre-set rating!`));
            }

            if (!user_model || !user_model.can('admin', 'create', 'assignment')) {
                if (params.is_acceptable !== undefined) return reject(ferror(ferror.FORBIDDEN).param('is_acceptable').msg('UNAUTHORIZED'))
            }

            let assignment;
            Assignment
                .forge(params)
                .save(null, { transacting: trx })
                .then(assignment_model => {
                    (assignment = assignment_model)
                        .outlets()
                        .attach(user_model.related('outlet').get('id'), { transacting: trx })
                        .then(done)
                        .catch(reject);
                })
                .catch(ferror.constraint(reject));

            function done() {
                resolve(assignment);
                notify();
            }

            function notify() {
                // Notifications
                let encoded_outlet_id = hashids.encode(user_model.related('outlet').get('id'));
                let encoded_assignment_id = hashids.encode(assignment.get('id'));

                // Auto Verify assignments after 15 minutes
                NotificationController.Mediums.Delayed
                    .send({
                        type: 'assignment-auto-verify',
                        key: assignment.get('id'),
                        delay: config.APPLICATION.DELAYS.AUTO_VERIFY,
                        fields: {
                            assignment_id: assignment.get('id')
                        }
                    })
                    .catch(reporter.report);

                // Slack notification
                NotificationController.Mediums.Slack
                    .send({
                        message: `*New Assignment!* <${config.SERVER.WEB_ROOT}outlet/${encoded_outlet_id}|_${user_model.related('outlet').get('title')}_> has created the assignment <${config.SERVER.WEB_ROOT}assignment/${encoded_assignment_id}|_${assignment.get('title')}_>`,
                        channel: config.SLACK.CHANNELS.DISPATCH
                    })
                    .catch(reporter.report);
                // User notifications
                NotificationController
                    .notify({
                        type: 'outlet-assignment-pending',
                        recipients: {
                            outlets: user_model.related('outlet')
                        },
                        payload: {
                            sms: `${user_model.get('full_name')} submitted a new assignment: ${assignment.get('title')}`,
                            email: {
                                subject: `Assignment submitted: ${assignment.get('title')}`,
                                template_name: 'assignment',
                                template_content: NotificationController.Types.Assignment.makeAssignmentEmail({
                                    assignment,
                                    operation: NotificationController.Types.Assignment.EMAIL_OPERATIONS.SUBMITTED
                                })
                            }
                        }
                    })
                    .catch(reporter.report);
            }
        })
    }

    /**
     * Gets an assignment
     * @param id
     */
    get(user_model, ids, trx) {
        return new Promise((resolve, reject) => {
            let isArr = true;
            if (!_.isArray(ids)) {
                isArr = false;
                ids = [ids];
            }

            Assignment
                .query(qb => {
                    qb.select(Assignment.GEO_FILTERS.PUBLIC);
                    qb.whereIn('id', ids);
                })
                .fetchAll({ transacting: trx })
                .then(ac => {
                    if (isArr) {
                        resolve(ac.models);
                    } else if (ac.length) {
                        resolve(ac.models[0]);
                    } else {
                        reject(ferror(ferror.NOT_FOUND).msg('Assignment(s) not found'));
                    }
                })
                .catch(ferror.constraint(reject));
        });
    }

    posts(assignment_id, { rating, status, sortBy = 'id', direction = 'desc', last, page, limit = 20 } = {}, { user, trx } = {}) {
        return Assignment
            .forge({ id: assignment_id })
            .fetch({
                require: true,
                transacting: trx,
                withRelated: {
                    posts: qb => {
                        // TODO The checks in here should be done in Post.QUERIES.VISIBLE
                        let select = [...Post.GEO_FILTERS.PUBLIC.map(f => typeof f === 'string' ? `posts.${f}` : f)];

                        if (user && !user.related('outlet').isNew()) {
                            select.push(Post.knex.raw(
                                `(CASE WHEN ("posts"."outlet_id" = ?) THEN ("posts"."created_at" + INTERVAL '${config.APPLICATION.DELAYS.HAS_FIRST_LOOK} MILLISECONDS') ELSE NULL END) AS first_look_until`,
                                [user.related('outlet').get('id')]
                            ));
                        }

                        qb.select(select);
                        Post.QUERIES.VISIBLE(qb, {
                            user,
                            rating: !isNaN(rating) ? rating : null,
                            ratings: _.isArray(rating) ? rating.filter(n => !isNaN(n)) : null,
                            status: !isNaN(status) ? status : null,
                            statuses: _.isArray(status) ? status.filter(n => !isNaN(n)) : null
                        });
                        Post.paginate(qb, { sortBy, direction, last, page, limit });
                    }
                }
            })
            .catch(Assignment.NotFoundError, () =>
                Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Invalid assignment')
                )
            )
            .then(assignment => assignment.related('posts').models) // Return the array of posts
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Update an assignment
     * @returns {Promise}
     */
     update(assignment_id, updates = {}, { user, trx } = {}) {
        if (!Object.keys(updates).length) {
            return Promise.reject(ferror(ferror.INVALID_REQUEST).msg('No updates provided'));
        }

        let is_admin = user.can('admin', 'update', 'assignment');
        let is_scheudled = false; // Flag for if this assignment has any scheduled information
        let assignment = Assignment.forge({ id: assignment_id });
        let {
            outlets_add = [],
            outlets_remove = [],
            posts_add = [],
            posts_remove = []
        } = updates;

        if (!is_admin) {
            if (updates.is_acceptable !== undefined) {
                return Promise.reject(
                    ferror(ferror.FORBIDDEN).param('is_acceptable').msg('UNAUTHORIZED')
                );
            }
        }

        delete updates.outlets_add;
        delete updates.outlets_remove;
        delete updates.posts_add;
        delete updates.posts_remove;

        updates.updated_at = new Date();
        if (updates.location === null) {
            updates.address = updates.radius = null;
        }

        return assignment
            .fetch({ require: true })
            .catch(Assignment.NotFoundError, () =>
                Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Invalid assignment')
                )
            )
            .then(() => {
                // All relation-based operations, i.e. adding a post to the assignment
                let operations = [];

                if (!_.isEmpty(updates)) {
                    operations.push(assignment.save(updates, { patch: true, transacting: trx }));
                }

                if (outlets_add.length) {
                    operations.push(assignment.outlets().attach(outlets_add, { transacting: trx }));
                }

                if (outlets_remove.length) {
                    operations.push(assignment.outlets().detach(outlets_remove, { transacting: trx }));
                }

                if (posts_add.length) {
                    operations.push(
                        Post
                            .query(qb => qb.whereIn('id', posts_add))
                            .save({ assignment_id: assignment.get('id') }, { patch: true, transacting: trx })
                    );
                }

                if (posts_remove.length) {
                    operations.push(
                        Post
                            .query(qb => qb.whereIn('id', posts_remove))
                            .save({ assignment_id: null }, { patch: true, transacting: trx })
                    );
                }

                return Promise.all(operations);
            })
            .then(() => { // Manage scheduler triggers
                if (assignment.get('rating') !== Assignment.RATING.APPROVED || assignment.get('ends_at') < new Date()) {
                    return;
                }

                return Promise.all([
                    (updates.ends_at != null)
                        ? scheduler.update(scheduler.slugs.assignment.end, assignment.get('id'), { run_at: updates.ends_at })
                        : Promise.resolve(),
                    (updates.starts_at != null)
                        ? scheduler.update(scheduler.slugs.assignment.start, assignment.get('id'), { run_at: updates.starts_at })
                        : Promise.resolve()
                ])
            })
            .then(() => assignment)
            .catch(err => Promise.reject(ferror.constraint(err)));
     }


    merge(user_model, assignment_id, params = {}, trx) {
         let self = this;
        return new Promise((resolve, reject) => {
            let parent_assignment = Assignment.forge({ id: params.merge_into_id });
            let old_assignment = Assignment.forge({ id: assignment_id });

            Promise
                .all([
                    old_assignment.fetch({ require: true, withRelated: ['outlets'] }),
                    parent_assignment.fetch({ require: true, withRelated: ['outlets'] })
                ])
                .then(doMerge)
                .catch(Assignment.NotFoundError, ferror(ferror.NOT_FOUND).trip(reject))
                .catch(ferror.constraint(reject));

            function doMerge() {
                let old_outlet_ids = old_assignment.related('outlets').models.map(m => m.get('id'));
                let parent_outlet_ids = parent_assignment.related('outlets').models.map(m => m.get('id'));
                let new_parent_outlet_ids = _.difference(old_outlet_ids, parent_outlet_ids);

                parent_assignment
                    .outlets()
                    .attach(new_parent_outlet_ids, { transacting: trx })
                    .then(updateAndRemove)
                    .catch(ferror.constraint(reject));
            }

            function updateAndRemove() {
                let old_title = old_assignment.get('title'); // #destroy will clear all current & previous attrs
                Promise
                    .all([
                        new Promise((yes, no) => { // update parent
                            if (!Assignment.COLUMNS.with(Object.keys(params)).length) return yes(); // If no assignment updates, skip
                            parent_assignment
                                .save(params, { patch: true, transacting: trx })
                                .then(yes)
                                .catch(ferror.constraint(no));
                        }),
                        new Promise((yes, no) => { // destroy old
                            old_assignment
                                .destroy({ transacting: trx })
                                .then(() => old_assignment.set('title', old_title))
                                .then(yes)
                                .catch(ferror.constraint(no));
                        })
                    ])
                    .then(done)
                    .catch(reject);
            }

            function done() {
                resolve(parent_assignment);
                notify();
            }

            function notify() {
                // Notifications
                // TODO notification error reporting
                let slack_curator = `<${config.SERVER.WEB_ROOT}user/${hashids.encode(user_model.get('id'))}|${user_model.get('full_name') || user_model.get('username')}>`;

                // Slack notification
                NotificationController.Mediums.Slack
                    .send({
                        message: `*Assignment Merged!* ${slack_curator} has approved the assignment "${old_assignment.get('title')}" and has merged it into the assignment <${config.SERVER.WEB_ROOT}assignment/${hashids.encode(parent_assignment.get('id'))}|_${parent_assignment.get('title')}_>`,
                        channel: config.SLACK.CHANNELS.DISPATCH
                    })
                    .catch(reporter.report);
                // User notifications
                NotificationController
                    .notify({
                        type: 'outlet-assignment-approved',
                        recipients: {
                            outlets: old_assignment.related('outlets').models
                        },
                        payload: {
                            sms: `${old_assignment.get('title')} was approved and merged with ${parent_assignment.get('title')}`,
                            email: {
                                subject: `Assignment approved: ${old_assignment.get('title')}`,
                                template_name: 'assignment',
                                template_content: NotificationController.Types.Assignment.makeAssignmentEmail({
                                    assignment: parent_assignment,
                                    old_assignment,
                                    operation: NotificationController.Types.Assignment.EMAIL_OPERATIONS.MERGED
                                })
                            }
                        }
                    })
                    .catch(reporter.report);
            }
        });
    }

    /**
     * Finds active assignments near a user
     */
    find(user_model, { geo, radius = 0, where = 'intersects', sortBy = 'starts_at', direction = 'desc', last, page, limit = 20 } = {}, trx) {
        let _this = this;
        where = where.toLowerCase();
        return new Promise((resolve, reject) => {
            Assignment
                .query(qb => {
                    qb.select([
                        ...Assignment.GEO_FILTERS.PUBLIC,
                        Assignment.knex.raw(`(select image from posts where assignment_id = assignments.id limit 1) as thumbnail`),
                        Assignment.knex.raw(`
                            json_build_object(
                                'photos', (select SUM(CASE WHEN stream IS NULL AND RATING > 1 THEN 1 ELSE 0 END) from posts where assignment_id = assignments.id),
                                'videos', (select SUM(CASE WHEN stream IS NOT NULL AND RATING > 1 THEN 1 ELSE 0 END) from posts where assignment_id = assignments.id)
                            ) as stats
                        `)
                    ]);

                    qb.where('rating', Assignment.RATING.APPROVED);
                    qb.where('ends_at', '>', new Date());

                    if (geo) {
                        Assignment.queryGeo(qb, {
                            where, radius,
                            locationColumn: 'location_buffered',
                            geoJson: geo
                        });
                    }

                    if(user_model && !user_model.related('outlet').isNew() && !user_model.can('admin', 'get', 'assignment')) {
                        qb.whereRaw('id in (SELECT assignment_id from assignment_outlets where outlet_id = ?)', user_model.related('outlet').get('id'));
                    }

                    Assignment.paginate(qb, { sortBy, direction, last, page, limit });
                })
                .fetchAll({ transacting: trx })
                .then(getActiveGlobals)
                .catch(ferror.constraint(reject));

           function getActiveGlobals(nearby) {
                Assignment
                    .query(qb => {
                        qb.select(Assignment.FILTERS.PUBLIC);
                        qb.whereNull('location');
                        qb.where('rating', Assignment.RATING.APPROVED);
                        // TODO: Add this back in when assignment start times are set correctly
                        // qb.where('starts_at', '<', new Date());
                        qb.where('ends_at', '>', new Date());
                        qb.orderBy(sortBy, direction);
                    })
                    .fetchAll({ transacting: trx })
                    .then(globals => resolve({
                        nearby: nearby.models,
                        global: globals.models
                    }))
                    .catch(ferror.constraint(reject));
           }
        })
    }

    /**
     * Returns the assignments that the list of post locations can be submitted to.
     * The pagination parameters only apply to the "nearby" field
     * @param user_model    {User}      The user making the request
     * @param geo           {GeoJSON}   The geometry to test (Should be multipoint)
     * @param sortBy        {String}    Column to sort the results by
     * @param direction     {String}    Direction to sort by (asc, desc)
     * @param last          {Integer}   The last assignment you saw
     * @param page          {Integer}   The page you want to get
     * @param limit         {Integer}   The maximum number of assignments to return
     * @param trx
     * @returns {Promise.<Object>}
     */
    checkPosts(user_model, {geo, sortBy = 'starts_at', direction = 'desc', last, page, limit = 20 } = {}, trx) {
        return Assignment
            .query(qb => {
                qb.select(Assignment.GEO_FILTERS.PUBLIC)
                qb.where('rating', Assignment.RATING.APPROVED);
                qb.where('ends_at', '>', new Date());
                qb.where('starts_at', '<', new Date());

                Assignment.queryGeo(qb, {
                    where: 'coveredby',
                    geoJson: geo,
                    radiusRaw: Assignment.knex.raw('radius * ((1900 / (radius + 400)) + 1)')
                });

                if(user_model && !user_model.related('outlet').isNew() && !user_model.can('admin', 'get', 'assignment')) {
                    qb.whereRaw('id in (SELECT assignment_id from assignment_outlets where outlet_id = ?)', user_model.related('outlet').get('id'));
                }

                Assignment.paginate(qb, { sortBy, direction, last, page, limit });
            })
            .fetchAll({ transacting: trx })
            .then(getActiveGlobals)
            .catch(ferror.constraint);

        function getActiveGlobals(nearby) {
            return Assignment
                .query(qb => {
                    qb.select(Assignment.FILTERS.PUBLIC);
                    qb.whereNull('location');
                    qb.where('rating', Assignment.RATING.APPROVED);
                    qb.where('ends_at', '>', new Date());
                    qb.where('starts_at', '<', new Date());
                    qb.orderBy(sortBy, direction);
                })
                .fetchAll({ transacting: trx })
                .then(globals => {
                    return {
                        nearby: nearby.models,
                        global: globals.models
                    }
                });
        }
    }

    /**
     * Finds active assignments near a user
     */
    list(user_model, {
        rating,
        starts_before,
        starts_after,
        ends_before,
        ends_after,
        geo,
        radius,
        where = 'intersects',
        sortBy = 'starts_at',
        direction = 'desc',
        last,
        page,
        limit = 20
    } = {}, trx) {
        let _this = this;
        where = where.toLowerCase()
        let isAdmin = !!user_model && user_model.can('admin', 'get', 'assignment');
        let isOutlet = !!user_model && user_model.has('outlet_id');
        if (!user_model || (!isAdmin && !isOutlet)) {
            rating = Assignment.RATING.APPROVED;
        }

        return Assignment
            .query(qb => {
                qb.select(Assignment.GEO_FILTERS.PUBLIC);

                if (geo) {
                    Assignment.queryGeo(qb, { geoJson: geo, radius, where, locationColumn: 'location_buffered' });
                }

                if (rating !== undefined) {
                    qb[_.isArray(rating) ? 'whereIn' : 'where']('rating', rating);
                }
                if (starts_after) {
                    qb.where('starts_at', '>', new Date(starts_after));
                }
                if (starts_before) {
                    qb.where('starts_at', '<', new Date(starts_before));
                }
                if (ends_after) {
                    qb.where('ends_at', '>', new Date(ends_after));
                }
                if (ends_before) {
                    qb.where('ends_at', '<', new Date(ends_before));
                }

                if (!isAdmin) Assignment.QUERIES.BY_OUTLET(qb, { user: user_model });
                Assignment.paginate(qb, { sortBy, direction, last, page, limit });
            })
            .fetchAll({ transacting: trx })
            .then(coll => Promise.resolve(coll.models))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Approves pending assignment
     *
     * @param curator_model
     * @param assignment_id
     * @param updates
     * @param trx
     */
    approve(curator_model, assignment_id, updates = {}, trx) {
        let _this = this;
        return new Promise((resolve, reject) => {
            let assignment = Assignment.forge({ id: assignment_id });

            assignment
                .fetch({
                    require: true,
                    withRelated: ['outlets']
                })
                .then(verify)
                .catch(Assignment.NotFoundError, ferror(ferror.NOT_FOUND).trip(reject))
                .catch(ferror.constraint(reject));

            function verify() {
                if (assignment.get('rating') !== Assignment.RATING.UNRATED) {
                    return reject(ferror(ferror.FAILED_REQUEST).msg('This assignment has already been rated'));
                }

                if (updates.location === null) {
                    updates.radius = updates.address = null;
                }

                if (updates.starts_at) updates.starts_at = new Date(updates.starts_at);
                if (updates.ends_at) updates.ends_at = new Date(updates.ends_at);
                updates.curated_at = updates.updated_at = new Date();
                updates.curator_id = curator_model.get('id');
                updates.rating = Assignment.RATING.APPROVED;

                assignment
                    .save(updates, {
                        patch: true,
                        method: 'update',
                        transacting: trx
                    })
                    .then(createTriggers)
                    .catch(ferror.constraint(reject));
            }

            function createTriggers() {
                // Dont create triggers for assignments that have passed
                if (assignment.get('ends_at') < new Date()) return done();
                Promise
                    .all([
                        // End trigger
                        scheduler.add(scheduler.slugs.assignment.end, assignment.get('id'), {
                            run_at: assignment.get('ends_at'),
                            request: {
                                href: config.SERVER.API_ROOT + scheduler.paths.assignment.end,
                                headers: {
                                    Authorization: 'Basic ' + config.SCHEDULER.client_credentials_base64
                                },
                                method: 'post',
                                body: { assignment_id: assignment.get('id') }
                            }
                        }),
                        // Start trigger
                        scheduler.add(scheduler.slugs.assignment.start, assignment.get('id'), {
                            run_at: assignment.get('starts_at'),
                            request: {
                                href: config.SERVER.API_ROOT + scheduler.paths.assignment.start,
                                headers: {
                                    Authorization: 'Basic ' + config.SCHEDULER.client_credentials_base64
                                },
                                method: 'post',
                                body: { assignment_id: assignment.get('id') }
                            }
                        })
                    ])
                    .then(done)
                    .catch(ferror.constraint(reject))
            }

            function notify() {
                let encoded_assignment_id = hashids.encode(assignment.get('id'));

                // Slack notification
                NotificationController.Mediums.Slack
                    .send({
                        message: `*Assignment Approved!* ${curator_model.get('full_name') || curator_model.get('username')} has approved the assignment <${config.SERVER.WEB_ROOT}assignment/${encoded_assignment_id}|_${assignment.get('title')}_>`,
                        channel: config.SLACK.CHANNELS.DISPATCH
                    })
                    .catch(reporter.report);
                // User notifications
                NotificationController
                    .notify({
                        type: 'outlet-assignment-approved',
                        recipients: {
                            outlets: assignment.related('outlets').models
                        },
                        payload: {
                            sms: `Assignment Approved: ${assignment.get('title')}`,
                            email: {
                                subject: `Assignment Approved: ${assignment.get('title')}`,
                                template_name: 'assignment',
                                template_content: NotificationController.Types.Assignment.makeAssignmentEmail({
                                    assignment,
                                    operation: NotificationController.Types.Assignment.EMAIL_OPERATIONS.APPROVED
                                })
                            }
                        }
                    })
                    .catch(reporter.report);
            }

            function done() {
                resolve(assignment);
                notify();
            }
        });
    }

    /**
     * Used to alert assignments about new content
     *
     * @param post_model {bookshelf.Model}
     * @param trx {knex.Transaction}
     */
     contentAlert(post_model, trx) {
        return post_model
            .load([ 'assignment', 'assignment.outlets' ], { transacting: trx })
            .then(post_model => {
                let firstlook_id = post_model.get('outlet_id');
                let assignment_id = post_model.get('assignment_id');
                let outlet_ids = post_model.related('assignment').related('outlets').models.map(outlet => outlet.get('id'));

                for (let outlet_id of outlet_ids) {
                    let delay, firstlook;

                    firstlook = outlet_id === firstlook_id;

                    if (outlet_ids.length > 1) {
                        delay = firstlook ? config.APPLICATION.DELAYS.ASSIGNMENT.FIRSTLOOK : config.APPLICATION.DELAYS.ASSIGNMENT.STANDARD;
                    }
                    else {
                        // If there is only one outlet, then the notification gets sent 'immediately'
                        delay = config.APPLICATION.DELAYS.ASSIGNMENT.FIRSTLOOK;
                    }

                    sendNotif(assignment_id, outlet_id, firstlook, delay)
                }
            });

        function sendNotif(assignment_id, outlet_id, firstlook, delay) {
            let key = `${assignment_id}-${outlet_id}`;
            let type = firstlook ? 'outlet-assignment-content-firstlook' : 'outlet-assignment-content';
            return NotificationController.Mediums.Delayed
                .send({
                    type,
                    key,
                    delay,
                    fields: {
                        assignment_id,
                        outlet_id,
                        post_ids: [post_model.get('id')]
                    },
                    behaviors: {
                        $push: ['post_ids']
                    }
                })
                .catch(reporter.report); // Swallow errors so other notifs can send despite failures
        }
    }

    /**
     * Rejects pending assignment
     *
     * @param assignment_id
     */
    reject(user_model, id, trx) {
        return new Promise((resolve, reject) => {
            let self = this;
            let assignment = Assignment.forge({ id });

            assignment
                .fetch({ require: true, withRelated: ['outlets'] })
                .then(() => assignment.save({
                    curator_id: user_model.get('id'),
                    rating: Assignment.RATING.REJECTED,
                    curated_at: new Date(),
                    updated_at: new Date()
                }, {
                    patch: true,
                    method: 'update',
                    transacting: trx
                }))
                .then(done)
                .catch(Assignment.NotFoundError, ferror(ferror.NOT_FOUND).trip(reject))
                .catch(ferror.constraint(reject));

            function done() {
                resolve({ success: 'ok' });

                // TODO notification error reporting
                // TODO " and was delivered to N users"
                let curator = `<${config.SERVER.WEB_ROOT}user/${hashids.encode(user_model.get('id'))}|${user_model.get('full_name') || user_model.get('username')}>`;

                // <a href="${config.SERVER.WEB_ROOT}contact">contact us</a>
                const contactLink = NotificationController.Mediums.Email.createEmailLink({
                    link: 'contact',
                    content: 'contact us',
                    referral: {
                        type: 'email',
                        email_name: 'assignment-expired',
                        assignment_id: hashids.encode(assignment.get('id'))
                    }
                });

                // Slack notification
                NotificationController.Mediums.Slack
                    .send({
                        message: `*Assignment Denied!* ${curator} has denied the assignment: <${config.SERVER.WEB_ROOT}assignment/${hashids.encode(assignment.get('id'))}|_${assignment.get('title')}_>`,
                        channel: config.SLACK.CHANNELS.DISPATCH
                    })
                    .catch(reporter.report);
                // User notifications
                NotificationController
                    .notify({
                        type: 'outlet-assignment-rejected',
                        recipients: {
                            outlets: assignment.related('outlets').models
                        },
                        payload: {
                            sms: `Assignment rejected: ${assignment.get('title')}`,
                            email: {
                                subject: `Assignment rejected: ${assignment.get('title')}`,
                                template_name: 'assignment',
                                template_content: NotificationController.Types.Assignment.makeAssignmentEmail({
                                    assignment,
                                    operation: NotificationController.Types.Assignment.EMAIL_OPERATIONS.REJECTED,
                                    info: `If you believe that this was done in error, please resubmit or ${contactLink}.`
                                })
                            }
                        }
                    })
                    .catch(reporter.report);
            }
        });
    }

    /**
     * Adds user to assigment_users
     *
     * @param assignment_id
     * @param user_id
     */
    accept(user_model, assignment_id, trx) {
        return new Promise((resolve, reject) => {
            let assignment = Assignment.forge({ id: assignment_id });

            Assignment
                .query(qb => {
                    qb.innerJoin('assignment_users','assignments.id','assignment_users.assignment_id');
                    qb.where('assignment_users.user_id', user_model.get('id'));
                    qb.whereRaw('assignments.ends_at > CURRENT_TIMESTAMP');
                })
                .fetch({ transacting: trx })
                .then(a => {
                    if (!a) {
                        return assignment
                            .fetch({ require: true })
                            .then(attachUser)
                            .catch(Assignment.NotFoundError, ferror(ferror.NOT_FOUND).msg('Assignment not found').trip(reject))
                            .catch(ferror.constraint(reject));
                    }
                    else {
                        return reject(ferror(ferror.INVALID_REQUEST).msg('This user already has accepted an assignment'));
                    }
                });

            function attachUser() {
                if (!assignment.get('is_acceptable')) {
                    return reject(ferror(ferror.INVALID_REQUEST).msg('Assignment not acceptable'));
                }

                assignment
                    .users()
                    .attach(user_model.get('id'), { transacting: trx })
                    .then(done)
                    .catch(ferror.constraint(reject));
            }

            function done() {
                resolve(assignment);
                notify();
            }

            function notify() {
                NotificationController.Mediums.Delayed
                    .send({
                        type: 'outlet-assignment-accepted',
                        key: assignment.get('id'),
                        delay: config.APPLICATION.DELAYS.ASSIGNMENT.ACCEPTED,
                        fields: {
                            assignment_id: assignment.get('id'),
                            user_ids: [user_model.get('id')],
                        },
                        behaviors: {
                            $push: ['user_ids']
                        }
                    })
                    .catch(reporter.report); // Swallow errors so other notifs can send

                user_model
                    .location()
                    .fetch()
                    .then(user_loc => {
                        if (!user_loc) return -1;
                        return user_loc.distanceTo(assignment.get('location'));
                    })
                    .then(distance => {
                        let encoded_assignment_id = hashids.encode(assignment.get('id'));
                        let encoded_user_id = hashids.encode(user_model.get('id'));

                        let message = `*Assignment Accepted!* <${config.SERVER.WEB_ROOT}user/${encoded_user_id}|_${user_model.name()}_> has accepted the assignment <${config.SERVER.WEB_ROOT}assignment/${encoded_assignment_id}|_${assignment.get('title')}_>\n`;

                        if (distance > 0) {
                            message += `They are *${distance > 1 ? distance.toFixed(0) : distance.toFixed(1)}* miles away!`;
                        }
                        else {
                            message += 'There is no active location on this user!';
                        }

                        NotificationController.Mediums.Slack
                            .send({
                                message,
                                channel: config.SLACK.CHANNELS.DISPATCH_ACCEPTS
                            })
                            .catch(reporter.report);
                    });
            }
        });
    }

    unaccept(user_model, assignment_id, trx) {
        return new Promise((resolve, reject) => {
            let assignment = Assignment.forge({ id: assignment_id });

            assignment
                .fetch({ require: true, transacting: trx })
                .then(detachUser)
                .catch(Assignment.NotFoundError, ferror(ferror.NOT_FOUND).msg('Assignment not found').trip(reject))
                .catch(ferror.constraint(reject));

            function detachUser() {
                assignment
                    .users()
                    .detach(user_model.get('id'), { transacting: trx })
                    .then(done)
                    .catch(ferror.constraint(reject));
            }

            function done() {
                resolve(assignment);
                notify();
            }

            function notify() {
                let encoded_assignment_id = hashids.encode(assignment.get('id'));
                let encoded_user_id = hashids.encode(user_model.get('id'));
                
                let message = `*Assignment Un-Accepted!* <${config.SERVER.WEB_ROOT}user/${encoded_user_id}|_${user_model.name()}_> has un-accepted the assignment <${config.SERVER.WEB_ROOT}assignment/${encoded_assignment_id}|_${assignment.get('title')}_>`;
                NotificationController.Mediums.Slack
                    .send({
                        message,
                        channel: config.SLACK.CHANNELS.DISPATCH_ACCEPTS
                    })
                    .catch(reporter.report);
            }
        });
    }

    accepted({ assignment_id, sortBy = 'id', direction = 'desc', last, page, limit = 20 } = {}, { user, trx } = {}) {
        if (!user.can('admin', 'get', 'assignment')) {
            return Promise.reject(ferror(ferror.FORBIDDEN));
        }

        return User
            .query(qb => {
                qb.select('users.*', User.knex.raw(`
                    (CASE WHEN assignments.location IS NULL
                    THEN NULL
                    ELSE (ST_Distance(user_locations.curr_geo::GEOGRAPHY, assignments.location_buffered) / ?)
                    END) AS distance
                `, [constants.METERS_PER_MILE]))
                qb.innerJoin('assignment_users', 'users.id', 'assignment_users.user_id');
                qb.innerJoin('assignments', 'assignments.id', 'assignment_users.assignment_id');
                qb.innerJoin('user_locations', 'user_locations.user_id', 'users.id');
                qb.where('assignment_users.assignment_id', assignment_id);
                User.paginate(qb, { sortBy, direction, last, page, limit });
            })
            .fetchAll({ transacting: trx })
            .then(coll => coll.models)
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    acceptedBy(user_model, trx) {
        return Assignment
            .query(qb => {
                qb.innerJoin('assignment_users','assignments.id','assignment_users.assignment_id');
                qb.where('assignment_users.user_id', user_model.get('id'));
                qb.whereRaw('assignments.ends_at > CURRENT_TIMESTAMP');
            })
            .fetch({ transacting: trx })
            .then(model => model || false)
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Search for assignments using fulltext search
     *
     * @param {Model} user_model
     * @param {Object} options
     * @param {String} options.q
     * @param {GeoJSON} options.geo
     * @param {String} options.geo_where
     * @param {Integer} options.last
     * @param {Integer} options.limit
     */
    search(user_model, {
        q,
        a,
        rating,
        created_after,
        created_before,
        starts_after,
        starts_before,
        ends_after,
        ends_before,
        geo,
        radius,
        count = true,
        geo_where = 'intersects',
        last,
        limit = 10,
        sortBy = 'created_at',
        direction = 'desc'
    } = {}, trx) {
        let isAdmin = !!user_model && user_model.can('admin', 'get', 'assignment');
        let isOutlet = !!user_model && user_model.can('outlet', 'get', 'assignment');

        if (!user_model || (!isAdmin && !isOutlet)) {
            rating = Assignment.RATING.APPROVED;
        }

        let autocomplete_by

        q = q && q.trim ? q.trim() : q;
        a = a && a.trim ? a.trim() : a;

        if (a) {
            autocomplete_by = (Object.keys(a)[0] || '');
            if(!Assignment.COLUMNS.includes(autocomplete_by)) {
                return Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Your autocomplete field is invalid!')
                );
            }
        }

        return Assignment
            .query(qb => {
                let inner_qb = Assignment.knex('assignments').select('assignments.*');
                let last_qb = Assignment.knex('assignments').select('*').where('id', last).limit(1);

                if (count)  inner_qb.select(Assignment.knex.raw('COUNT(*) OVER() AS __result_count'));

                // FTS query if querystring provided
                if (q) {
                    inner_qb.from(Assignment.knex.raw('PLAINTO_OR_TSQUERY(?) AS "_fts_query", assignments', [q]))
                    inner_qb.select(Assignment.knex.raw('TS_RANK("_fts", "_fts_query") AS "_fts_rank"'))
                    inner_qb.whereRaw('?? @@ ??', ['_fts', '_fts_query']);
                    sortBy = '_fts_rank';

                    if (last) {
                        last_qb.select(Assignment.knex.raw('TS_RANK("_fts", PLAINTO_OR_TSQUERY(?)) AS "_fts_rank"', [q]));
                        qb.whereRaw('"assignments"."_fts_rank" <= "last_assignment"."_fts_rank"');
                    }
                } else if (autocomplete_by) {
                    inner_qb.select(
                        Assignment.knex.raw(
                            `LENGTH(REGEXP_REPLACE("assignments".??, ?, '','i')) AS _autocomp_score`,
                            [autocomplete_by, a[autocomplete_by] + '.*']
                        )
                    );
                    last_qb.select(
                        Assignment.knex.raw(
                            `LENGTH(REGEXP_REPLACE("assignments".??, ?, '','i')) AS _autocomp_score`,
                            [autocomplete_by, a[autocomplete_by] + '.*']
                        )
                    );
                    sortBy = '_autocomp_score';
                    direction = 'asc';

                    //Like query against passed field
                    inner_qb.whereRaw('?? ILIKE ?', [
                        autocomplete_by,
                        `%${a[autocomplete_by]}%`
                    ]);
                }

                if (_.isArray(rating)) {
                    inner_qb.whereIn('rating', rating.filter(n => !isNaN(n)));
                } else if(!isNaN(rating)) {
                    inner_qb.where('rating', rating);
                }
                if (created_before) {
                    inner_qb.where('assignments.created_at', '<', created_before);
                }
                if (created_after) {
                    inner_qb.where('assignments.created_at', '>', created_after);
                }
                if (starts_before) {
                    inner_qb.where('starts_at', '<', starts_before);
                }
                if (starts_after) {
                    inner_qb.where('starts_at', '>', starts_after);
                }
                if (ends_before) {
                    inner_qb.where('ends_at', '<', ends_before);
                }
                if (ends_after) {
                    inner_qb.where('ends_at', '>', ends_after);
                }
                if (geo) {
                    Assignment.queryGeo(inner_qb, { geoJson: geo, radius, where: geo_where, locationColumn: 'location_buffered' });
                }
                if (user_model && user_model.outlet && !isAdmin) {
                    Assignment.QUERIES.BY_OUTLET(inner_qb, { user: user_model });
                }

                let from_query = `(${inner_qb.toString()}) AS assignments`;

                if (last) {
                    qb.where(function() {
                        this.where('assignments.' + sortBy, direction === 'asc' ? '>' : '<', Assignment.knex.raw('last_assignment.' + sortBy))
                        this.orWhere(function() {
                            this.where('assignments.' + sortBy, Assignment.knex.raw('last_assignment.' + sortBy));
                            this.where('assignments.id', '<', Assignment.knex.raw('last_assignment.id'));
                        });
                    });
                    from_query += `, (${last_qb.toString()}) AS last_assignment`;
                }

                qb.from(Assignment.knex.raw(from_query));
                qb.select(...Assignment.GEO_FILTERS.ALL);
                if (count) qb.select('__result_count');
                qb.orderBy('assignments.' + sortBy, direction);
                if (sortBy === '_autocomp_score') qb.orderBy('assignments.' + autocomplete_by, direction);
                qb.orderBy('assignments.id', 'desc');

                qb.limit(limit);
            })
            .fetchAll({ transacting: trx })
            .then(assignment_coll => {
                let result = { results: assignment_coll.models };

                if (count) {
                    let _count = 0;
                    for (let assignment_model of assignment_coll.models) {
                        _count = parseInt(assignment_model.get('__result_count'), 10);
                        assignment_model.unset('__result_count');
                    }
                    result.count = _count;
                }

                return result;
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    report(user_model, { since = new Date(Date.now() - (1000 * 60 * 60 * 24 * 30)), outlet_id } = {}) {
        return new Promise((resolve, reject) => {
            let knex = Assignment.knex;

            if (!user_model.can('admin', 'create', 'assignment-report')) {
                outlet_id = outlet_id || user_model.related('outlet').get('id');
                if ((user_model.related('outlet').get('id') !== outlet_id)) {
                    return reject(
                        ferror(ferror.FORBIDDEN)
                            .param('outlet_id')
                            .value(outlet_id)
                            .msg(`You cannot access ${outlet_id ? 'all' : "this outlet's"} assignments`)
                        );
                }
            }

            // TODO "position" vs "outlets" for authed users
            knex
                .raw(`
                   SELECT
                        assignments.id AS assignment_id,
                        assignments.title AS title,
                        assignments.address AS address,
                        assignments.radius AS radius,
                        to_char(assignments.created_at, 'Day') AS day,
                        to_char(assignments.created_at, 'HH12:MI:SSAM TZ') AS time,
                        to_char(assignments.created_at, 'MM/DD/YYYY') AS date,
                        COALESCE(MIN(creator.email), NULL) AS creator_email,
                        MIN(creator_outlet.id) AS original_outlet_id,
                        MIN(creator_outlet.title) AS original_outlet,
                        ARRAY_TO_STRING(ARRAY(
                            SELECT title
                            FROM assignment_outlets
                            INNER JOIN outlets ON outlets.id = assignment_outlets.outlet_id
                            WHERE assignment_outlets.assignment_id = assignments.id
                            GROUP BY outlets.title, assignment_outlets.created_at
                            ORDER BY assignment_outlets.created_at ASC
                        ), ',') AS outlets,
                        COUNT(DISTINCT _submissions.owner_id) AS users,
                        COUNT(_submissions) AS submission_count,
                        SUM(CASE WHEN _submissions.rating = 2 THEN 1 ELSE 0 END) AS submission_approved_count,
                        SUM(CASE WHEN _submissions.image IS NOT NULL AND _submissions.video IS NULL THEN 1 ELSE 0 END) AS submission_photo_count,
                        SUM(CASE WHEN _submissions.video IS NOT NULL THEN 1 ELSE 0 END) AS submission_video_count,
                        COALESCE(MIN(_submissions.created_at), NULL) AS first_submission_at,
                        COALESCE(MAX(_purchases.purchases), 0) AS purchased_count,
                        COALESCE(MAX(_purchases.photos_purchased), 0) AS purchased_photo_count,
                        COALESCE(MAX(_purchases.videos_purchased), 0) AS purchased_video_count
                    FROM
                        assignments
                    LEFT JOIN users AS creator ON creator.id = assignments.creator_id
                    LEFT JOIN outlets AS creator_outlet ON creator.outlet_id = creator_outlet.id
                    LEFT JOIN (
                            SELECT
                                purchases.assignment_id AS assignment_id,
                                COUNT(DISTINCT post_id) AS purchases,
                                SUM(CASE WHEN posts.video NOTNULL THEN 1 ELSE 0 END) AS videos_purchased,
                                SUM(CASE WHEN posts.video NOTNULL THEN 0 ELSE 1 END) AS photos_purchased
                            FROM purchases
                            INNER JOIN posts ON posts.id = purchases.post_id
                            GROUP BY purchases.assignment_id
                        )
                        AS _purchases
                        ON _purchases.assignment_id = assignments.id
                    LEFT JOIN posts AS _submissions ON _submissions.assignment_id = assignments.id
                    WHERE assignments.created_at >= ?
                    GROUP BY assignments.id
                    ORDER BY assignments.created_at DESC;
                `, [since])
                .then(result => resolve(result.rows))
                .catch(ferror.trip(reject));
        });
    }

    getUsers(assignment_id, trx) {
        return this
            .get(null, assignment_id)
            .then(assignment_model =>
                User
                    .query(qb => {
                        qb.innerJoin('user_locations', 'users.id', 'user_locations.user_id');
                        qb.where('user_locations.curr_timestamp', '>=', User.knex.raw("CURRENT_TIMESTAMP - INTERVAL '2 days'"));
                        qb.whereRaw(
                            `ST_Intersects(ST_Buffer(user_locations.curr_geo::geography, users.radius), ST_Buffer(ST_geomFromGeoJSON(?)::geography, ?))`,
                            [assignment_model.get('location'), assignment_model.get('radius') || 0]
                        );
                    })
                    .fetchAll({ transacting: trx })
                    .then(user_collection => user_collection.models)
            )
    }
}

module.exports = new AssignmentController;

const NotificationController = require('../Notification');
const OutletController = require('../Outlet');
const PostController = require('../Post');
const UserController = require('../User');
