'use strict';

const _ = require('lodash');
const AWS = require('aws-sdk');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const gm = require('gm');
const Promise = require('bluebird');

const config = require('../../config');

const ferror = require('../../lib/frescoerror');
const hashids = require('../../lib/hashids');
const reporter = require('../../lib/reporter');
const constants = require('../../lib/constants');
const scheduler = require('../../lib/scheduler');

const User = require('../../models/user');
const Gallery = require('../../models/gallery');
const GalleryLike = require('../../models/gallery_like');
const GalleryRepost = require('../../models/gallery_repost');
const UserReport = require('../../models/user_report');
const Post = require('../../models/post');
const Report = require('../../models/report');
const RoleModel = require('../../models/role');
const UserIdentity = require('../../models/user_identity');
const SocialLink = require('../../models/social_link');
const Outlet = require('../../models/outlet');
const FollowingUsers = require('../../models/following_users');

const s3 = new AWS.S3();

Promise.promisifyAll(bcrypt);

class UserController {

    /**
     * Attaches stats and social fields to user(s)
     * 
     * @param users
     * @param user_model
     */
    build(user_model, users, {
        filter = User.FILTERS.SELF,
        keep_fields = [],
        show_outlet = false,
        show_social_links = false,
        show_social_stats = false,
        show_submission_stats = false,
        show_report_stats = false,
        show_blocked = false,
        show_terms = false,
        show_identity = false,
        show_disabled = false,
        show_roles = false,

        build_outlet = {},

        trx
    } = {}) {
        if (!users) return Promise.resolve();

        let isArr = true;
        if(!_.isArray(users)) {
            isArr = false;
            users = [users];
        }
        if (users.length === 0) return Promise.resolve(users);

        // map: Hashmap, hash being the related id, and value being an array of gallery models that share that relationship
        // ids: Array of all user ids that need this relationship resolved
        // build: Array of models to call the respective Controller#build function on, after fetching all relations
        let references = {
            users: { map: {}, ids: [] }, // map: user id -> user model hashmap, ids = array of all user ids
            outlets: { build: [], map: {}, ids: [] },
            social_links: { ids: [] },
            identities: { ids: [] },
            roles: { ids: [] }
        };

        for (let user of users) {
            let _user_id = user.get('id');
            let _outlet_id = user.get('outlet_id');
            user.columns(filter.concat(keep_fields));
            user.trigger('fetched', user);

            // TODO This should preferrably be removed and defined within the api bridge, or have clients handle it
            if (user.has('radius')) {
                user.set('radius', parseFloat(user.get('radius') / constants.METERS_PER_MILE).toFixed(2));
            }

            references.users.ids.push(_user_id);
            references.users.map[_user_id] = user;

            // NOTE defaults are set below because if users have no results
            // in the corresponding query, they will not be included in the
            // query results

            if (show_outlet) {
                if (user.relations.outlet && !user.related('outlet').isNew()) {
                    references.outlets.build.push(user.relations.outlet);
                } else {
                    user.relations.outlet = Outlet.nullable();

                    if (_outlet_id) {
                        if (!references.outlets.map[_outlet_id]) {
                            references.outlets.map[_outlet_id] = [user];
                            references.outlets.ids.push(_outlet_id);
                        } else {
                            references.outlets.map[_outlet_id].push(user);
                        }
                    }
                }
            } else {
                delete user.relations.outlet;
            }
            if (show_identity) {
                if (user.relations.identity && !user.related('identity').isNew()) {
                    user.relations.identity.columns(UserIdentity.FILTERS.SELF);
                } else {
                    user.relations.identity = UserIdentity.nullable();
                    references.identities.ids.push(_user_id);
                }
            } else {
                delete user.relations.identity;
            }
            if (show_social_links) {
                user.set('social_links', {});

                if (user.related('social_links').length > 0) {
                    user.related('social_links').each(model => {
                        user.get('social_links')[model.get('platform')] = model.get('account_id');
                    });
                } else {
                    references.social_links.ids.push(_user_id);
                }
                delete user.relations.social_links;
            } else {
                user.unset('social_links');
                delete user.relations.social_links;
            }
            if (show_roles) {
                if (user.related('roles').length > 0) {
                    user.set('roles', user.related('roles').map(r => r.get('tag')));
                } else {
                    user.set('roles', []);
                    references.roles.ids.push(_user_id);
                }
            } // Delete roles regardless of show_roles so they are not returned in the JSON
            delete user.relations.roles;

            if (show_social_stats) {
                // Set default stats
                user.set('following_count', 0);
                user.set('followed_count', 0);
                if (user_model && user_model.get('id') !== user.get('id')) {
                    user.set('following', false);
                }
            } else {
                user.unset('following_count');
                user.unset('followed_count');
                user.unset('following');
            }
            if (show_submission_stats) {
                // Set default stats
                user.set('photo_count', 0);
                user.set('video_count', 0);
                user.set('submission_count', 0);
            } else {
                user.unset('photo_count');
                user.unset('video_count');
                user.unset('submission_count');
            }
            if (show_report_stats) {
                user.set('report_count', 0);
                user.set('reports_made', 0);
                user.set('reports_false', 0);
                user.set('report_reasons', []);
            } else {
                user.unset('report_count');
                user.unset('reports_made');
                user.unset('reports_false');
                user.unset('report_reasons');
            }
            if (show_blocked && user_model) {
                user.set('blocked', false);
                user.set('blocking', false);
            } else {
                user.unset('blocked');
                user.unset('blocking');
            }

            if (show_disabled) {
                user.set('disabled', false);
            }

            delete user.relations.settings; // Trim settings object if exists
        }

        return Promise.all([
            // Outlet promise
            new Promise((yes, no) => {
                if (!show_outlet) return yes();

                Outlet.knex.from('outlets')
                    .select('outlets.*')
                    .whereIn('outlets.id', references.outlets.ids)
                    .transacting(trx)
                    .then((rows = []) => {
                        for (let row of rows) {
                            let _outlet = Outlet.forge(row);
                            references.outlets.map[row.id].forEach(u => u.relations.outlet = _outlet);
                            references.outlets.build.push(_outlet);
                        }

                        OutletController
                            .build(user_model, references.outlets.build, Object.assign({
                                filter: Outlet.FILTERS.SELF,
                                show_owner: true,
                                trx
                            }, build_outlet))
                            .then(yes)
                            .catch(no);
                    }).catch(no);
            }),
            // Identity promise
            new Promise((yes, no) => {
                if (!show_identity) return yes();
                User.knex('user_identities')
                    .select('*')
                    .whereIn('user_id', references.identities.ids)
                    .transacting(trx)
                    .then(rows => {
                        for (let row of rows) {
                            references.users.map[row.user_id].relations.identity = new UserIdentity(row).columns(UserIdentity.FILTERS.SELF);
                        }

                        yes();
                    })
                    .catch(no);
            }),
            // Social links promise
            new Promise((yes, no) => {
                if (!show_social_links) return yes();

                User.knex('social_links')
                    .select('*')
                    .whereIn('user_id', references.social_links.ids)
                    .transacting(trx)
                    .then(rows => {
                        for (let row of rows) {
                            references.users.map[row.user_id].get('social_links')[row.platform] = row.account_id; // hohooo pass by reference bitchessss
                        }

                        yes();
                    })
                    .catch(no);
            }),
            // Social stats promise
            new Promise((yes, no) => {
                if (!show_social_stats) return yes();

                User.knex('following_users')
                    .select('user_id', 'other_id')
                    .whereIn('user_id', references.users.ids)
                    .orWhereIn('other_id', references.users.ids)
                    .transacting(trx)
                    .then(rows => {
                        for (let row of rows) {
                            let _following = references.users.map[row.user_id];
                            let _followed = references.users.map[row.other_id];

                            if (_following) {
                                _following.set('following_count', _following.get('following_count') + 1);
                            }
                            if (_followed) {
                                _followed.set('followed_count', _followed.get('followed_count') + 1);
                            }

                            if (user_model && _followed && user_model.get('id') === row.user_id) {
                                _followed.set('following', true);
                            }
                        }
                        yes();
                    })
                    .catch(no);
                }),
                // Submissions stats promise
                new Promise((yes, no) => {
                    if (!show_submission_stats) return yes();
                    let post_count_query = User.knex('posts')
                        .select(
                            User.knex.raw('NULL AS submission_count'),
                            User.knex.raw('SUM(CASE WHEN video IS NULL THEN 1 ELSE 0 END) AS photo_count'),
                            User.knex.raw('SUM(CASE WHEN video IS NOT NULL THEN 1 ELSE 0 END) AS video_count'),
                            'owner_id'
                        )
                        .whereIn('owner_id', references.users.ids)
                        .groupBy('owner_id');
                    let gallery_count_query = User.knex('posts')
                        .select(
                            User.knex.raw('COUNT(*) AS submission_count'),
                            User.knex.raw('NULL AS photo_count'),
                            User.knex.raw('NULL AS video_count'),
                            'owner_id'
                        )
                        .whereIn('owner_id', references.users.ids)
                        .groupBy('owner_id');

                    User.knex.raw(`
                            (${post_count_query.toString()})
                            UNION
                            (${gallery_count_query.toString()})
                        `)
                        .transacting(trx)
                        .then(({ rows = [] } = {}) => {
                            for (let row of rows) {
                                let _user = references.users.map[row.owner_id];
                                if (row.submission_count) {
                                    _user.set('submission_count', parseInt(row.submission_count, 10));
                                } else {
                                    _user.set('photo_count', parseInt(row.photo_count, 10));
                                    _user.set('video_count', parseInt(row.video_count, 10));
                                }
                            }
                            yes();
                        })
                        .catch(no);
                }),
                // Report Stats
                new Promise((yes, no) => {
                    if (!show_report_stats) return yes();

                    let qb = UserReport.knex
                        .from('user_reports')
                        .innerJoin('reports', 'user_reports.report_id', 'reports.id')
                        .select(
                            'user_reports.user_id',
                            UserReport.knex.raw('COUNT(*) AS report_count'),
                            UserReport.knex.raw('array_agg(DISTINCT reports.reason) AS reasons')
                        )
                        .whereIn('user_reports.user_id', references.users.ids)
                        .groupBy('user_reports.user_id')
                        .where(qb => Report.QUERIES.VISIBLE(qb))
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let u = references.users.map[row.user_id];
                                u.set('report_count', parseInt(row.report_count, 10));
                                u.set('report_reasons', row.reasons);
                            }
                            yes();
                        })
                        .catch(no);
                }),
                // Reports Made
                new Promise((yes, no) => {
                    if (!show_report_stats) return yes();
                    Report.knex
                        .from('reports')
                        .select(
                            'reports.user_id',
                            Report.knex.raw('COUNT(*) AS reports_made'),
                            Report.knex.raw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS reports_false', [Report.STATUS.SKIPPED])
                        )
                        .whereIn('reports.user_id', references.users.ids)
                        .groupBy('reports.user_id')
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let u = references.users.map[row.user_id];
                                u.set('reports_made', parseInt(row.reports_made, 10));
                                u.set('reports_false', parseInt(row.reports_false, 10));
                            }
                            yes();
                        }).catch(no);
                }),
                // Blocked promise
                new Promise((yes, no) => {
                    if (!show_blocked || !user_model) return yes();

                    User.knex('user_blocks')
                        .select('*')
                        .where('blocking_user_id', user_model.get('id'))
                        .whereIn('blocked_user_id', references.users.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                references.users.map[row.blocked_user_id].set('blocking', true);
                            }
                            yes();
                        })
                        .catch(no);
                }),
                // Roles promise
                new Promise((yes, no) => {
                    if (!show_roles) return yes();

                    User.knex('users')
                        .innerJoin('user_roles', 'user_roles.user_id', 'users.id')
                        .innerJoin('roles', 'roles.id', 'user_roles.role_id')
                        .select('users.id', User.knex.raw('ARRAY_AGG(roles.tag) AS role_arr'))
                        .whereIn('users.id', references.roles.ids)
                        .groupBy('users.id')
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                references.users.map[row.id].set('roles', row.role_arr);
                            }
                            yes();
                        })
                        .catch(no);
                }),
                new Promise((yes, no) => {
                    if (!show_blocked || !user_model) return yes();

                    User.knex('user_blocks')
                        .select('*')
                        .where('blocked_user_id', user_model.get('id'))
                        .whereIn('blocking_user_id', references.users.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                references.users.map[row.blocking_user_id].set('blocked', true);
                            }
                            yes();
                        })
                        .catch(no);
                }),
                // Terms promise
                new Promise((yes, no) => {
                    if (!show_terms) {    
                        users.forEach(user => user.unset('terms'));
                        return yes();
                    }

                    Promise
                        .map(users, user => 
                            TermsController
                                .fetchTerms(user)
                                .then(terms => Promise.resolve(user.set('terms', terms)))
                        )
                        .then(yes)
                        .catch(no);
                }),
                //Disabled promise
                new Promise((yes, no) => {
                    if (!show_disabled) return yes();

                    User.knex('users')
                        .select(
                            'id',
                            User.knex.raw('expires_at NOTNULL AS disabled')
                        )
                        .whereIn('id', references.users.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                references.users.map[row.id].set('disabled', row.disabled);
                            }
                        })
                        .then(yes)
                        .catch(no);
                })
            ])
            .then(() => Promise.resolve(isArr ? users : users[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Registers user
     *
     * @param data
     * @param data.email (required)
     * @param data.username (required)
     * @param data.password (required)
     * @param data.full_name
     * @param data.bio
     * @param data.phone
     * @param data.avatar
     * @param data.twitter_handle
     * @param data.verification_token
     * @param data.social_links
     * @param data.social_links[platform][token]
     * @param data.social_links[platform][secret]
     * @param data.social_links[platform][jwt]
     * 
     * @param data.oauth_client
     *
     * Installation parameter group (optional):
     *
     * @param data.installation.app_version (required)
     * @param data.installation.platform (required)
     * @param data.installation.device_token
     * @param data.installation.timezone
     * @param data.installation.locale_identifier
     *
     * Outlet parameter group (optional):
     * @param data.outlet.title
     * @param data.outlet.link
     *
     * @returns {Promise}
     */
    create(data, { trx } = {}) {
        if (data.username && data.username.includes(' ')) {
            return Promise.reject(ferror(ferror.INVALID_REQUEST).param('username').msg('Username cannot contain spaces'));
        }
        if (data.email && data.email.includes(' ')) {
            return Promise.reject(ferror(ferror.INVALID_REQUEST).param('email').msg('Email cannot contain spaces'));
        }

        let user_model = new User(data);
        let roles = ['user'];

        return user_model
            .save(null, { transacting: trx })
            .then(() => Promise.all([
                TermsController.agreeToTerms(user_model, trx),
                makeInstallation(),
                makeOutlet(),
                linkSocial(),
                user_model.identity().save(null, { method: 'insert', transacting: trx }),
                module.exports.Settings.initializeUser(user_model, {}, trx),
                followAccounts()
            ]))
            .then(giveRoles)
            .then(() => {
                //Send welcome email to new users (after a delay)
                NotificationController.Mediums.Delayed
                    .send({
                        type: 'user-new',
                        key: user_model.get('id'),
                        delay: config.APPLICATION.DELAYS.NEW_USER,
                        fields: {
                            user_id: user_model.get('id')
                        }
                    })
                    .catch(reporter.report);
                
                return user_model
            })
            .catch(err => Promise.reject(ferror.constraint(err)));

        function giveRoles() {
            return RoleModel
                .where('tag', 'IN', roles)
                .fetchAll({ transacting: trx })
                .then(collection =>
                    user_model
                        .roles()
                        .attach(collection.models, { transacting: trx })
                )
        }

        function makeInstallation() {
            if (!data.installation || !data.installation.device_token) return Promise.resolve();
            data.installation.user_id = user_model.get('id');
            return module.exports.Installation
                .upsert(user_model, data.installation, trx);
        }

        function makeOutlet() {
            if(!data.outlet) return Promise.resolve();

            if(data.outlet.token) {
                return OutletController
                    .Members
                    .join(user_model, data.outlet.token, trx)
            } else {
                roles.push('outlet-admin'); // TODO non-hardcoded roles
                return OutletController
                    .create(user_model, data.outlet, trx);
            }
        }

        function linkSocial() {
            if (!data.social_links) return Promise.resolve();
            let promises = []

            if (data.social_links.twitter) {
                promises.push(
                    SocialController.Twitter
                        .linkAccount(data.social_links.twitter, { trx, user: user_model })
                );
            }
            if (data.social_links.facebook) {
                promises.push(
                    SocialController.Facebook
                        .linkAccount(data.social_links.facebook, { trx, user: user_model })
                );
            }
            if (data.social_links.google) {
                promises.push(
                    SocialController.Google
                        .linkAccount(data.social_links.google, { trx, user: user_model })
                );
            }

            return Promise.all(promises);
        }

        function followAccounts() {
            return user_model
                .followed_users()
                .attach(config.APPLICATION.AUTO_FOLLOW.IDS, { transacting: trx })
        }
    }

    /**
     * @param {object} user_model requesting user
     * @param user - ID, Email, or Username
     * @returns {Promise}
     */
    find(user_model, user) {
        return new Promise((resolve, reject) => {
            this.getByIdOrUsername(user)
                .fetch({ require: true })
                .then(resolve)
                .catch(User.NotFoundError, ferror(ferror.NOT_FOUND).msg('User not found').trip(reject))
                .catch(ferror.constraint(reject));
        });
    }

    /**
     * Sets the following status of the given user id to true for the following
     * user. If user is newly followed, row is created and followed user is
     * notified. If row already existed, just update the status and skip notifying.
     *
     * @param {number} user_id id of user being followed
     * @param {object} context
     * @param {UserModel} context.user user who is following
     * @param {knex.Transaction} [context.trx]
     * 
     * @returns {Promise}
     */
    follow(user_id, { user, trx } = {}) {
        if(user_id == user.get('id')) {
            return Promise.reject(ferror(ferror.INVALID_REQUEST).msg('You cannot follow yourself!'));
        }

        return FollowingUsers
            .where({
                user_id: user.get('id'),
                other_id: user_id
            })
            .fetch({
                require: true,
                transacting: trx
            })
            .then(follow_model => {
                if (follow_model.get('active')) {
                    return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .msg('You already follow this user!')
                    );
                }

                return follow_model.save({
                    active: true,
                    action_at: new Date()
                }, {
                    patch: true,
                    transacting: trx
                });
            })
            .catch(FollowingUsers.NotFoundError, () =>
                new FollowingUsers({
                    user_id: user.get('id'),
                    other_id: user_id
                })
                .save(null, { transacting: trx })
                .then(notify)
            )
            .then(() => Promise.resolve({ success: 'ok' }))
            .catch(err => Promise.reject(ferror.constraint(err)));

        function notify() {
            NotificationController.Mediums.Delayed
                .send({
                    type: 'user-social-followed',
                    key: user_id,
                    delay: config.APPLICATION.DELAYS.SOCIAL,
                    fields: {
                        user_id: user_id,
                        user_ids: [user.get('id')]
                    },
                    behaviors: {
                        $push: ['user_ids']
                    }
                })
                .catch(reporter.report) // Swallow errors so other notifs can send despite failures
        }
    }

    /**
     * Checks if there is a user who has at least one of the given fields, returning
     * an array of those which are not available.
     * 
     * @param params {object}
     * @param params.email {string}
     * @param params.username {string}
     * 
     * @returns {array[string]}
     */
    check({ username, email } = {}, trx) {
        if (!username && !email) {
            return Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Empty request'))
        }
        if (username) username = username.toLowerCase();
        if (email) email = email.toLowerCase();
        return User
            .query(qb => {
                if (username) qb.whereRaw('LOWER(username) = ?', [username]);
                if (email) qb.orWhereRaw('LOWER(email) = ?', [email]);
            })
            .fetchAll({
                transacting: trx
            })
            .then(coll => {
                let unavail = [];
                for (let model of coll.models) {
                    if (username && model.has('username') && model.get('username').toLowerCase() === username) unavail.push('username');
                    if (email && model.has('email') && model.get('email').toLowerCase() === email) unavail.push('email');
                }
                return Promise.resolve(unavail);
            })
            .catch(err => Promise.reject(ferror.constraint(err)))
    }

    getByIdOrUsername(str) {
        return User.query(qb => {
            if (_.isNumber(str)) qb.where('id', str);
            qb.orWhereRaw('LOWER(username) = LOWER(?)', [str]);
            qb.orWhereRaw('LOWER(email) = LOWER(?)', [str]);
        });
    }

    /**
     * Sets user's following status of given user id to false
     *
     * @param {number} user_id id of user being unfollowed
     * @param {object} context
     * @param {UserModel} context.user user who is unfollowing
     * @param {knex.Transaction} [context.trx]
     * 
     * @returns {Promise}
     */
    unfollow(user_id, { user, trx } = {}) {
        return FollowingUsers
            .where({
                user_id: user.get('id'),
                other_id: user_id
            })
            .save({
                active: false,
                action_at: new Date()
            }, {
                patch: true,
                transacting: trx
            })
            .then(() => scheduler.get('user-social-followed', user_id))
            .then(schedule => {
                if (!schedule) return;

                let body = schedule.request.body;
                body.user_ids = body.user_ids.filter(uid => uid != user.get('id'));

                return scheduler.update(schedule, { request: { body } });
            })
            .then(() => Promise.resolve({ success: 'ok'}))
            .catch(FollowingUsers.NoRowsUpdatedError, () =>
                Promise.reject(ferror(ferror.INVALID_REQUEST).msg('You are not following that user!'))
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Gets `users` user is following
     *
     * NOTE: Returns JSON
     *
     * @param user_model
     * @param user
     * @returns {Promise}
     */
    following(user_model, user_id, { sortBy = 'username', direction = 'asc', limit = 20, last, page } = {}, trx) {
        if (!user_model && !user_id) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Missing user')
            );
        }

        return User
            .query(qb => {
                qb.innerJoin('following_users', 'other_id', 'users.id');
                qb.where('following_users.active', true);
                qb.where('following_users.user_id', user_id || user_model.get('id'));
                User.paginate(qb, { sortBy, direction, limit, last, page });
            })
            .fetchAll({
                transacting: trx
            })
            .then(coll => Promise.resolve(coll.models))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Gets user's followers.
     *
     * NOTE: Returns JSON
     *
     * @param user_model
     * @param user
     * @returns {Promise}
     */
    followers(user_model, user_id, { sortBy = 'username', direction = 'desc', limit = 20, last, page } = {}, trx) {
        if (!user_model && !user_id) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Missing user')
            );
        }

        return User
            .query(qb => {
                qb.innerJoin('following_users', 'user_id', 'users.id');
                qb.where('following_users.active', true);
                qb.where('following_users.other_id', user_id || user_model.get('id'));
                User.paginate(qb, { sortBy, direction, limit, last, page });
            })
            .fetchAll({
                transacting: trx
            })
            .then(coll => Promise.resolve(coll.models))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    getActions(perms) {
        let actions = [];
        
        let permissions = [];
        let rejected = [];

        for (let perm of perms) {
            if (perm[0] === '!') {
                perm = perm.substr(1, perm.length);
                rejected.push(new RegExp(perm.split(':').map(section => `(${section || '.*'})`).join(':')));
            } else {
                permissions.push(new RegExp(perm.split(':').map(section => `(${section || '.*'})`).join(':')));
            }
        }

        for (let action in config.PERMISSIONS) {
            let required = config.PERMISSIONS[action];
            if (_.isArray(required)) {
                if (required.every(
                    r => _.isArray(r) ? r.some(checkPermission) : checkPermission(r)
                )) {
                    actions.push(action);
                }
            } else if (checkPermission(required)) {
                actions.push(action);
            }
        }

        return actions;

        function checkPermission(perm) {
            if (permissions.some(s => s.test(perm))){
                return !rejected.some(s => s.test(perm));
            } else {
                return false;
            }
        }
    }

    get(user_model, user_ids = [], trx, active = true) {
        return new Promise((resolve, reject) => {
            let isArr = _.isArray(user_ids);
            User
                .where(qb => {
                    qb.select(User.FILTERS.PUBLIC);
                    if (isArr) {
                        qb.whereIn('id', user_ids);
                        qb.limit(user_ids.length);
                    } else {
                        qb.where('id', user_ids);
                        qb.limit(1);
                    }

                    if (active) {
                        User.QUERIES.ACTIVE(qb);
                    }
                })
                .fetchAll({ transacting: trx })
                .then(user_coll => {
                    if (!user_coll.length) {
                        return reject(ferror(ferror.NOT_FOUND).value(user_ids).msg(`User(s) "${isArr ? user_ids.join(', ') : user_ids}" not found`));
                    }

                    resolve(isArr ? user_coll.models : user_coll.models[0]);
                })
                .catch(User.NotFoundError, ferror(ferror.NOT_FOUND).msg('User not found').trip(reject))
                .catch(ferror.constraint(reject));
        });
    }

    /**
     * Gets the user with the matching credentials, if they exist
     * NOTE: Promise resolves null if not found
     * 
     * @param {string} email_username login credential representing the users username OR email
     * @param {string} password users password
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    login(email_username, password, trx) {
        email_username = String(email_username).toLowerCase().trim();

        return User
            .query(qb => {
                qb.where(User.knex.raw('LOWER(email)'), email_username).orWhere(User.knex.raw('LOWER(username)'), email_username)
            })
            .fetch({
                require: true,
                withRelated: ['outlet', 'roles'],
                transacting: trx
            })
            .then(user =>
                bcrypt
                    .compareAsync(password, user.get('password'))
                    .catch(err => Promise.reject(ferror(err).type(ferror.API).msg('Error comparing password hashes')))
                    .then(is_match => Promise.resolve(is_match ? user : false))
            )
            .catch(User.NotFoundError, () => Promise.resolve(false))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Resolves array of user ids.
     *
     * @param ids
     * @returns {Promise}
     */
    resolve(ids = []) {
        return new Promise((resolve, reject) => {
            User
                .whereIn('id', ids)
                .fetchAll()
                .then(resolve)
                .catch(ferror.constraint(reject))
        });
    }
    
    /**
     * Search for users based on name, username, email, bio, location string, etc...
     * 
     * @param {Model} user_model
     * @param {Object} options
     * @param {String} options.q
     * @param {Object} options.a Autocomplete field
     * @param {Integer} options.last
     * @param {Integer} options.limit
     */
    search(user_model, { q, a, created_before, created_after, count = true, last, limit = 10, sortBy = 'created_at', direction = 'desc' } = {}, trx) {
        let autocomplete_by

        q = q && q.trim ? q.trim() : q;
        a = a && a.trim ? a.trim() : a;

        if (a) {
            autocomplete_by = (Object.keys(a)[0] || '');
            if(!User.COLUMNS.includes(autocomplete_by)) {
                return Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Your autocomplete field is invalid!')
                );
            }
        }

        return User
            .query(qb => {
                let inner_qb = User.knex('users').select('users.*');
                let last_qb = User.knex('users').select('*').where('id', last).limit(1);

                if (count) inner_qb.select(User.knex.raw('COUNT(*) OVER() AS __result_count'));

                // FTS query if querystring provided
                if (q) {
                    inner_qb.from(User.knex.raw('users, PLAINTO_OR_TSQUERY(?) AS "_fts_query"', [q]))
                    inner_qb.select(User.knex.raw('TS_RANK("_fts", "_fts_query") AS "_fts_rank"'))
                    inner_qb.whereRaw('?? @@ ??', ['_fts', '_fts_query']);
                    sortBy = '_fts_rank';

                    if (last) {
                        last_qb.select(User.knex.raw('TS_RANK("_fts", PLAINTO_OR_TSQUERY(?)) AS "_fts_rank"', [q]));
                    }
                } else if (autocomplete_by) {
                    inner_qb.select(
                        User.knex.raw(
                            `LENGTH(REGEXP_REPLACE("users".??, ?, '','i')) AS _autocomp_score`,
                            [autocomplete_by, a[autocomplete_by] + '.*']
                        )
                    );
                    last_qb.select(
                        User.knex.raw(
                            `LENGTH(REGEXP_REPLACE("users".??, ?, '','i')) AS _autocomp_score`,
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

                // Query by timestamp, if provided
                if (created_before) {
                    inner_qb.where('created_at', '<', created_before);
                }
                if (created_after) {
                    inner_qb.where('created_at', '>', created_after);
                }

                User.QUERIES.ACTIVE(inner_qb);
                // User.QUERIES.BLOCKING_FILTER(inner_qb, { user: user_model });

                let from_query = `(${inner_qb.toString()}) AS users`;

                if (last) {
                    qb.where(function() {
                        this.where('users.' + sortBy, direction === 'asc' ? '>' : '<', User.knex.raw('last_user.' + sortBy))
                        this.orWhere(function() {
                            this.where('users.' + sortBy, User.knex.raw('last_user.' + sortBy));
                            this.where('users.id', '<', User.knex.raw('last_user.id'));
                        });
                    });
                    from_query += `, (${last_qb.toString()}) AS last_user`;
                }

                qb.from(User.knex.raw(from_query));
                qb.select('users.*');
                if (count) qb.select('__result_count');
                qb.orderBy('users.' + sortBy, direction);
                if (sortBy === '_autocomp_score') qb.orderBy('users.' + autocomplete_by, direction);
                qb.orderBy('users.id', 'desc');

                qb.limit(limit);
            })
            .fetchAll({ transacting: trx })
            .then(user_collection => {
                let result = { results: user_collection.models };

                if (count) {
                    let _count = 0;
                    for (let user_model of user_collection.models) {
                        _count = parseInt(user_model.get('__result_count'), 10);
                        user_model.unset('__result_count');
                    }
                    result.count = _count;
                }

                return result;
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Show the user a list of suggested users, based on their location
     * (if applicable), their most recent submission and their volume of
     * submissions.
     * 
     * @param user_model {bookshlef.Model}
     * @param trx {knex.Transaction} optional
     * 
     * @returns Promise(array[bookshelf.Model], ferror)
     */
    suggest(user_model, { limit = 10, by_location = true } = {}, trx) {
        let promise
        if (by_location && user_model) {
            promise = user_model
                .related('location')
                .fetch({ transacting: trx });
        } else {
            promise = Promise.resolve();
        }

        return promise
            .then(loc_model =>
                User
                    .query(qb => {
                        let inner_qb = User.knex('users');
                        inner_qb.select(
                            'users.*',
                            User.knex.raw("calculate_user_activity(users.id, 15, INTERVAL '1 month') AS activity_rating")
                        );

                        inner_qb.whereExists(function() {
                            this
                                .from('posts')
                                .select('*')
                                .where('owner_id', User.knex.raw('"users"."id"'))
                                .andWhere('created_at', '>=', User.knex.raw('CURRENT_TIMESTAMP - INTERVAL \'1 month\''))
                                .andWhere('rating', Post.RATING.VERIFIED)
                                .andWhere('status', Post.STATUS.COMPLETE)
                                .limit(1);
                        });

                        if (by_location && loc_model) {
                            inner_qb.innerJoin('user_locations', 'users.id', 'user_locations.user_id');
                            // inner_qb.where('user_locations.curr_timestamp', '>', ) TODO do we take this into consideration?
                            inner_qb.whereRaw(
                                'ST_DWithin(user_locations.curr_geo, ST_geomFromGeoJSON(?)::geography, ?, false)',
                                [loc_model.get('curr_geo'), 5 * constants.METERS_PER_MILE]
                            );
                        }
                        if (user_model) {
                            inner_qb.whereNot('users.id', user_model.get('id'))
                        }

                        inner_qb.limit(limit);
                        inner_qb.orderBy('activity_rating', 'desc');

                        qb.select(User.FILTERS.SAFE);
                        qb.from(User.knex.raw(`(${inner_qb.toString()}) users`))
                        qb.where('activity_rating', '>', 0);
                    })
                    .fetchAll({ transacting: trx })
                    .then(collection =>
                        (collection.length === 0  && loc_model)
                            ? this.suggest(user_model, { limit, by_location: false }, trx)
                            : Promise.resolve(collection.models)
                    )
            )
            .catch(err => Promise.reject(ferror.constraint(err)))
    }

    /**
     * Updates user given updates
     *
     * @param user_model
     * @param updates
     * @param trx
     * @returns {Promise}
     */
    update(user_model, user_id, updates, trx) {
        if (_.isEmpty(updates)) {
            return Promise.reject(ferror(ferror.INVALID_REQUEST).msg('No updates provided'));
        }
        if (updates.username && updates.username.includes(' ')) {
            return Promise.reject(ferror(ferror.INVALID_REQUEST).param('username').msg('Username cannot contain spaces'));
        }
        if (updates.email && updates.email.includes(' ')) {
            return Promise.reject(ferror(ferror.INVALID_REQUEST).param('email').msg('Email cannot contain spaces'));
        }

        return new Promise((resolve, reject) => {
            let _this = this;
            let target_user;

            if (!user_id || user_model.get('id') === user_id) {
                target_user = user_model;
            } else {
                if (!user_model.can('admin', 'update', 'user')) {
                    return reject(ferror(ferror.FORBIDDEN));
                }

                target_user = User.forge({ id: user_id });
            }

            if (
                target_user.get('id') === user_model.get('id')
                && (
                    updates.email
                    || updates.username
                    || updates.password
                )
            ) { // Fields that require password verification
                if (updates.verify_password) {
                    module.exports
                        .login(user_model.get('username') || user_model.get('email'), updates.verify_password, trx)
                        .then(model =>
                            (model === false)
                                ? Promise.reject(ferror(ferror.UNAUTHORIZED).param('verify_password').msg('Invalid password'))
                                : Promise.resolve(model)
                        )
                        .then(makeInstallation)
                        .catch(reject);
                } else if (updates.platform === 'facebook') {
                    SocialController.Facebook
                        .resolveToken(updates.token)
                        .then(account_id =>
                            SocialLink
                                .where({
                                    account_id,
                                    user_id: user_model.get('id'),
                                    platform: SocialLink.SOURCES.FACEBOOK
                                })
                                .fetch({
                                    require: true,
                                    transacting: trx
                                })
                                .catch(SocialLink.NotFoundError, () => Promise.reject(ferror(ferror.UNAUTHORIZED)))
                                .catch(err => Promise.reject(ferror.constraint(err)))
                        )
                        .then(makeInstallation)
                        .catch(reject);
                } else if (updates.platform === 'twitter') {
                    SocialController.Twitter
                        .resolveToken(updates.token, updates.secret)
                        .then(account_id =>
                            SocialLink
                                .where({
                                    account_id,
                                    user_id: user_model.get('id'),
                                    platform: SocialLink.SOURCES.TWITTER
                                })
                                .fetch({
                                    require: true,
                                    transacting: trx
                                })
                                .catch(SocialLink.NotFoundError, () => Promise.reject(ferror(ferror.UNAUTHORIZED)))
                                .catch(err => Promise.reject(ferror.constraint(err)))
                        )
                        .then(makeInstallation)
                        .catch(reject);
                } else if (updates.platform === 'google') {
                    SocialController.Google
                        .resolveToken(updates.jwt)
                        .then(account_id =>
                            SocialLink
                                .where({
                                    account_id,
                                    user_id: user_model.get('id'),
                                    platform: SocialLink.SOURCES.GOOGLE
                                })
                                .fetch({
                                    require: true,
                                    transacting: trx
                                })
                                .catch(SocialLink.NotFoundError, () => Promise.reject(ferror(ferror.UNAUTHORIZED)))
                                .catch(err => Promise.reject(ferror.constraint(err)))
                        )
                        .then(makeInstallation)
                        .catch(reject);
                } else {
                    return reject(ferror(ferror.UNAUTHORIZED).param('verify_password').msg('Current password/social authentication information required when updating email, username or password'));
                }
            } else {
                makeInstallation();
            }

            function makeInstallation() {
                if (!updates.installation || !updates.installation.device_token) return updateUser();

                updates.installation.user_id = target_user.get('id');

                _this.Installation
                    .upsert(user_model, updates.installation, trx)
                    .then(updateUser)
                    .catch(reject);
            }

            function updateUser() {
                if (_.isEmpty(User.COLUMNS.with(Object.keys(updates)))) return resolve(target_user);

                target_user
                    .save(updates, { patch: true, transacting: trx })
                    .then(resolve)
                    .catch(ferror.constraint(reject))
            }
        });
    }

    // TODO this is terrible
    updateAvatar(user_model, image, trx) {
        return new Promise((resolve, reject) => {
            if (!image) {
                return reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Missing image file')
                );
            }

            let extension = image.originalname.split('.').pop();
            let key = AWSController.genKey({ postfix: 'avatar' });

            gm(image.buffer)
                .noProfile()
                .toBuffer((err, buffer) => {
                    if (err) return reject(ferror(err).msg('Error processing image file'));

                    s3.putObject({
                        Bucket: config.AWS.S3.BUCKET,
                        ACL: 'public-read',
                        ContentType: image.mimetype,
                        ContentDisposition: 'inline',
                        Key: config.AWS.S3.UPLOAD_DIRECTORY + key + '.' + extension,
                        Body: buffer
                    }, (err, data) => {
                        if(err) reject(ferror(err).msg('Could not save your avatar!'));
                        else done(config.AWS.CLOUDFRONT.AVATAR_URL + key + config.AWS.CLOUDFRONT.IMAGE_EXTENSION);
                    });
                });

            function done(avatar) {
                user_model
                    .save({ avatar }, { patch: true, transacting: trx })
                    .then(r => resolve(user_model.columns(User.FILTERS.SELF)))
                    .catch(ferror.constraint(reject));
            }
        });
    }

    disable(user_model, params, trx) {
        let expires_date = new Date();
        expires_date.setFullYear(expires_date.getFullYear() + 1);
        return new Promise((resolve, reject) => {
            if (params.user_id) {
                if (user_model.can('admin', 'update', 'user')) {
                    return this
                        .get(user_model, params.user_id, null, false)
                        .then(user => {
                            return user.save({ expires_at: expires_date }, { transacting: trx });
                        })
                        .then(resolve)
                        .catch(reject)
                }
                else {
                    return reject(ferror(ferror.FORBIDDEN).msg('You are not authorized to perform this action'));
                }
            }

            if (params.username !== user_model.get('username') || params.email !== user_model.get('email')) {
                return reject(ferror(ferror.UNAUTHORIZED).msg('Invalid username or password!'));
            }

            module.exports
                .login(params.email, params.password, trx)
                .then(model =>
                    (model === false)
                        ? Promise.reject(ferror(ferror.UNAUTHORIZED).msg('Invalid username or password'))
                        : user_model.save({ expires_at: expires_date }, { transacting: trx })
                )
                .then(resolve)
                .catch(reject);
        });
    }

    suspend(user_model, user_id, suspended_until, trx) {
        return new Promise((resolve, reject) => {
            User
                .forge({ id: user_id })
                .fetch({ require: true, transacting: trx })
                .then(user => user.save({ suspended_until }, { patch: true, transacting: trx }))
                .then(() => resolve({ success: 'ok' }))
                .catch(User.NotFoundError, ferror(ferror.NOT_FOUND).trip(reject))
                .catch(ferror.constraint(reject));
        })
    }

    unsuspend(user_model, user_id, trx) {
        return new Promise((resolve, reject) => {
            User
                .forge({ id: user_id })
                .fetch({ require: true, transacting: trx })
                .then(user => user.save({ suspended_until: null }, { patch: trx, transacting: trx }))
                .then(() => resolve({ success: 'ok' }))
                .catch(User.NotFoundError, ferror(ferror.NOT_FOUND).trip(reject))
                .catch(ferror.constraint(reject));
        })
    }

    suspended(user_model, { sortBy = 'suspended_until', direction = 'desc', limit = 20, last, page } = {}) {
        return new Promise((resolve, reject) => {
            User
                .query(qb => {
                    qb.select(User.FILTERS.PUBLIC);
                    qb.where('suspended_until', '>', new Date());
                    User.paginate(qb, {sortBy, direction, limit, last, page });
                })
                .fetchAll()
                .then(coll => resolve(coll.models))
                .catch(ferror.trip(reject));
        });
    }

    delete(user_model, user_id, trx) {
        if (user_model.get('id') !== user_id && !user_model.can('admin', 'delete', 'user')) {
            return Promise.reject(
                ferror(ferror.FORBIDDEN)
                    .msg('You are not authorized to perform this action')
            );
        }

        return Gallery
                .where({ owner_id: user_id })
                .fetchAll({ transacting: trx })
            .then(galleries =>
                Promise.map(galleries.models, gallery =>
                    GalleryController.delete(user_model, gallery.get('id'), trx)
                )
            )
            .then(() =>
                User
                    .forge({ id: user_id })
                    .destroy({ transacting: trx })
            )
            .catch(User.NoRowsDeletedError, () =>
                Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Invalid user')
                )
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    enable(user_model, params = {}, trx) {
        if (!params.user_id || user_model.get('id') === params.user_id) {
            if (user_model.get('expires_at') === null) {
                return Promise.resolve(user_model);
            }
            return user_model
                .save({
                    expires_at: null
                }, {
                    patch: true,
                    transacting: trx
                })
                .catch(err => Promise.reject(ferror.constraint(err)));
        } else if (user_model.can('admin', 'update', 'user')) {
            return this
                .get(user_model, params.user_id, trx)
                .then(user => {
                    if (user.get('expires_at') === null) {
                        return Promise.resolve(user);
                    }

                    return user
                        .save({
                            expires_at: null
                        }, {
                            patch: true,
                            transacting: trx
                        })
                        .catch(err => Promise.reject(ferror.constraint(err)));;
                });
        } else {
            return Promise.reject(
                ferror(ferror.FORBIDDEN)
                    .msg('You are not authorized to perform this action')
            );
        }
    }

    block(user_model, user_id, trx) {
        if (user_id === user_model.get('id')) {
            return Promise.reject(ferror(ferror.INVALID_REQUEST).msg('You cannot block yourself!'));
        }

        return user_model
            .blocked_users()
            .attach(user_id, { transacting: trx })
            .then(() =>
                user_model
                    .followed_users()
                    .detach(user_id, { transacting: trx })
            )
            .then(() => 
                Gallery
                    .query(qb => qb.where('owner_id', user_id))
                    .fetchAll({ transacting: trx })
                    .then(coll =>
                        Promise.resolve(coll.models.map(g => g.get('id')))
                    )
            )
            .then(gallery_ids =>
                Promise.all([
                    GalleryLike
                        .where('user_id', user_model.get('id'))
                        .where('gallery_id', 'IN', gallery_ids)
                        .destroy({ transacting: trx }),
                    GalleryRepost
                        .where('user_id', user_model.get('id'))
                        .where('gallery_id', 'IN', gallery_ids)
                        .destroy({ transacting: trx })
                ])
            )
            .then(() => Promise.resolve({ success: 'ok' }))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    unblock(user_model, user_id, trx) {
        return User
            .forge({ id: user_id })
            .fetch({
                require: true,
                transacting: trx
            })
            .then(u =>
                user_model
                    .blocked_users()
                    .detach(u, { transacting: trx })
            )
            .then(() => Promise.resolve({ success: 'ok' }))
            .catch(User.NotFoundError, () =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('User does not exist!'))
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    blocked(user_model, { sortBy = 'username', direction = 'asc', limit = 20, last, page } = {}, trx) {
        return User
            .query(qb => {
                qb.innerJoin('user_blocks', 'user_blocks.blocked_user_id', 'users.id');
                qb.where('user_blocks.blocking_user_id', user_model.get('id'));
                User.paginate(qb, { sortBy, direction, limit, last, page });
            })
            .fetchAll({
                transacting: trx
            })
            .then(coll => Promise.resolve(coll.models))
            .catch(err => Promise.reject(ferror.constraint(err)));

    }

    reports(user_model, user_id, { sortBy = 'id', direction = 'desc', last, page, limit = 20 } = {}, trx) {
        return User
            .forge({ id: user_id || user_model.get('id') })
            .fetch({
                require: true,
                transacting: trx
            })
            .catch(User.NotFoundError, () =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('User not found'))
            )
            .then(reported_user =>
                Report
                    .query(qb => {
                        qb.innerJoin('user_reports', 'reports.id', 'user_reports.report_id');
                        qb.where('user_reports.user_id', reported_user.get('id'));
                        Report.QUERIES.VISIBLE(qb);
                        Report.paginate(qb, { sortBy, direction, last, page, limit });
                    })
                    .fetchAll({ transacting: trx })
            )
            .then(coll => Promise.resolve(coll.models))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    report(user_model, user_id, { reason, message } = {}, trx) {
        return ReportController
            .make(user_model, reason, message, trx)
            .then(report_model =>
                report_model
                    .reported_user()
                    .attach(user_id, { transacting: trx })
                    .then(() => Promise.resolve(report_model))
            )
            .then(report_model => report_model.fetch({ transacting: trx }))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    unreport(user_model, report_id, trx) {
        return Report
            .forge({ id: report_id })
            .destroy({
                require: true,
                transacting: trx
            })
            .then(() => Promise.resolve({ success: 'ok' }))
            .catch(Report.NoRowsDeletedError, () =>
                Promise.reject(
                    ferror(ferror.NOT_FOUND)
                        .msg('Report not found')
                )
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    reported(user_model, { reasons = ['spam', 'abuse', 'stolen'], sortBy = 'created_at', direction = 'desc', limit = 20, last } = {}) {
        return new Promise((resolve, reject) => {
            let reported_users = User.knex
                .select(
                    'user_reports.user_id',
                    User.knex.raw('MAX(reports.created_at) AS created_at')
                )
                .from('user_reports')
                .innerJoin('reports', 'user_reports.report_id', 'reports.id')
                .whereIn('reports.reason', reasons)
                .groupBy('user_reports.user_id');
            Report.QUERIES.VISIBLE(reported_users);

            let users = User.knex
                .select(User.disambiguate(User.FILTERS.PUBLIC))
                .from('reported_users')
                .innerJoin('users', 'reported_users.user_id', 'users.id');

            User.QUERIES.ACTIVE(users);

            // Manual pagination, because we need to sort by report created at
            // TODO figure out a better way to do this
            if (last) {
                users.where('users.id', '!=', last);
                users.whereRaw(
                    `?? ${ direction == 'desc' ? '<' : '>' } (SELECT ?? FROM ?? WHERE user_id = ?)`,
                    [`reported_users.created_at`, 'created_at', 'reported_users', last]
                );
            }
            users.orderBy('reported_users.created_at', direction);
            if (limit) {
                users.limit(limit);
            }

            User.knex
                .raw(`WITH "reported_users" AS (${reported_users}) ${users}`)
                .then(({ rows = [] }) => {
                    let us = [];
                    for (let row of rows) {
                        us.push(User.forge(row));
                    }
                    return us;
                })
                .then(resolve)
                .catch(ferror.trip(reject));
        })
    }

    skipReport(user_model, user_id, trx) {
        return new Promise((resolve, reject) => {
            Report.knex
                .raw(`
                    UPDATE reports
                    SET status = -1
                    WHERE reports.status = 0
                    AND reports.id IN (
                        SELECT report_id FROM user_reports WHERE user_id = ?
                    )
                `, [user_id])
                .transacting(trx)
                .then(() => resolve({ success: 'ok' }))
                .catch(ferror.constraint(reject));
        });
    }

    actReport(user_model, user_id, trx) {
        return new Promise((resolve, reject) => {
            User
                .forge({ id: user_id })
                .fetch({ transacting: trx })
                .then(u => {
                    if (u == null) {
                        return;
                    }
                    return User
                        .forge({ id: u.get('id') })
                        .save( {
                            offense_count: u.get('offense_count') + 1
                        }, {
                            patch: true,
                            transacting: trx
                        });
                })
                .then(() =>
                    Report.knex
                        .raw(`
                            UPDATE reports
                            SET status = 1
                            WHERE reports.status = 0
                            AND reports.id IN (
                                SELECT report_id FROM user_reports WHERE user_id = ?
                            )
                        `, [user_id])
                        .transacting(trx))
                .then(u => resolve({ success: 'ok' }))
                .catch(ferror.constraint(reject));
        })
    }

    isValidV2User(user_model, trx) {
        return User
            .forge({ id: user_model.get('id') })
            .fetch({
                require: true,
                transacting: trx
            })
            .then(full_user =>
                Promise.resolve(full_user.get('password') != null)
            )
            .catch(User.NotFoundError, err =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('User does not exist'))
            )
            .catch(err =>
                Promise.reject(ferror.constraint(err))
            );
    }
}

module.exports = new UserController;
module.exports.Location = require('./Location');
module.exports.Payment = require('./Payment');
module.exports.Identity = require('./Identity');
module.exports.Installation = require('./Installation');
module.exports.Settings = require('./Settings');

const AWSController = require('../AWS');
const GalleryController = require('../Gallery');
const NotificationController = require('../Notification');
const OutletController = require('../Outlet');
const ReportController = require('../Report');
const SocialController = require('../Social');
const TermsController = require('../Terms');