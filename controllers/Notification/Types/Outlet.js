'use strict';

const config = require('../../../config');
const ferror = require('../../../lib/frescoerror');
const Gallery = require('../../../models/gallery');
const hashids = require('../../../lib/hashids');
const Outlet = require('../../../models/outlet');
const OutletLocation = require('../../../models/outlet_location');
const Post = require('../../../models/post');
const User = require('../../../models/user');

class OutletNotificationController {

    locationContentNotification({
        location_ids,
        photo_count,
        video_count,
        post_ids
    } = {}) {
        return OutletLocation
            .query(qb => {
                qb.whereIn('id', location_ids);
            })
            .fetchAll({
                require: true,
                withRelated: ['outlet']
            })
            .then(loc_coll => send(loc_coll.models))
            .then(() => 'OK')
            .catch(OutletLocation.NotFoundError, err => Promise.reject(ferror(ferror.NOT_FOUND).param('location_ids').value(location_ids)))
            .catch(err => Promise.reject(ferror.constraint(err)));

        function send(location_models) {
            let outlet_id = parseInt(location_models[0].get('outlet_id'));
            let outlet = Outlet.forge({ id: outlet_id });

            return outlet
                .fetch()
                .then(() => Gallery
                    .query(qb => {
                        qb.select(Gallery.knex.raw('DISTINCT galleries.*'));
                        qb.innerJoin('posts', 'galleries.id', 'posts.parent_id');
                        qb.whereIn('posts.id', post_ids);
                        Gallery.QUERIES.VISIBLE(qb, { outlet });
                    })
                    .fetchAll({
                        withRelated: {
                            posts: qb => Post.QUERIES.VISIBLE(qb, { outlet })
                        }
                    })
                )
                .then(gallery_collection => {
                    let content_str = "";
                    if (photo_count) {
                        content_str += `${photo_count} ${photo_count === 1 ? 'photo' : 'photos'}`;
                        if (video_count) content_str += ' and ';
                    }
                    if (video_count) {
                        content_str += `${video_count} ${video_count === 1 ? 'video' : 'videos'}`;
                    }

                    if (photo_count + video_count > 1) {
                        content_str += ' were';
                    }
                    else {
                        content_str += ' was';
                    }

                    sendNotif('email');
                    sendNotif('sms');

                    function sendNotif(type) {
                        let knex = User.knex;
                        let user_settings = knex
                            .select(
                                knex.raw('users.id AS user_id'),
                                knex.raw('array_agg(outlet_locations.id) AS location_ids')
                            )
                            .from('users')
                            .crossJoin('outlet_locations')
                            .joinRaw('LEFT JOIN outlet_location_notification_settings olns ON users.id = olns.user_id AND olns.location_id = outlet_locations.id')
                            .where('users.outlet_id', outlet_id)
                            .whereIn('outlet_locations.id', location_ids)
                            .whereRaw('outlet_locations.outlet_id = users.outlet_id')
                            .whereRaw(`COALESCE(olns.send_${type}, outlet_locations.send_${type}_default) = TRUE`)
                            .groupBy('users.id')
                            .as('user_settings');

                        knex
                            .select('*')
                            .from(user_settings)
                            .innerJoin('users', 'user_settings.user_id', 'users.id')
                            .then(results => {
                                for(let res of results) {
                                    let user = new User(res);
                                    let filteredLocations = location_models.filter(loc_model => res.location_ids.includes(loc_model.get('id')))

                                    let title_str = 'content';
                                    if (photo_count === 0) {
                                        title_str = video_count > 1 ? 'videos' : 'video';
                                    }
                                    else if (video_count === 0) {
                                        title_str = photo_count > 1 ? 'photos' : 'photo';
                                    }

                                    let title = `New ${title_str} available from multiple locations`;
                                    if (filteredLocations.length == 1) {
                                        title = `New ${title_str} posted from ${filteredLocations[0].get('title')}`;
                                    }

                                    let payload = {};
                                    if (type == 'email') {
                                        let location_links = filteredLocations.map(location_model => {
                                            // return `<a href="${config.SERVER.WEB_ROOT}location/${hashids.encode(location_model.get('id'))}">${location_model.get('title')}</a>`
                                            return NotificationController.Mediums.Email.createEmailLink({
                                                link: `location/${hashids.encode(location_model.get('id'))}`,
                                                content: location_model.get('title'),
                                                referral: {
                                                    type: 'email',
                                                    email_name: 'location-content',
                                                    location_id: hashids.encode(location_model.get('id'))
                                                }
                                            });
                                        }).join(' | ');

                                        let gallery_models = gallery_collection.models;
                                        let email_content = gallery_models.map(gallery => {
                                            return NotificationController.Mediums.Email.createEmailGallery(gallery, {
                                                type: 'email',
                                                email_name: 'location-content'
                                            })
                                        });

                                        payload.email = {
                                            subject: title,
                                            template_name: 'multi-gallery',
                                            template_content: [
                                                {
                                                    name: 'galleries',
                                                    content: email_content
                                                },
                                                {
                                                    name: 'description',
                                                    content: 'Here\'s the latest from ' + location_links
                                                }
                                            ]
                                        }
                                    }
                                    else {
                                        let locations = filteredLocations.map(l => l.get('title')).join(' | ');
                                        payload.sms = `${content_str} posted from ${locations}`;
                                    }

                                    NotificationController.notify({
                                        type: 'outlet-location-content',
                                        skip_check: true,
                                        recipients: {
                                            users: user
                                        },
                                        payload
                                    })
                                }
                            });
                    }
                })
        }
    }
}

module.exports = new OutletNotificationController;

const NotificationController = require('../index');