'use strict';

const _ = require('lodash');
const Assignment = require('../models/assignment');
const config = require('../config');
const ferror = require('../lib/frescoerror');
const hashids = require('../lib/hashids');
const reporter = require('../lib/reporter');
const scheduler = require('../lib/scheduler');
const stripe = require('../lib/stripe');
const Post = require('../models/post');
const Promise = require('bluebird');
const Purchase = require('../models/purchase');
const Outlet = require('../models/outlet');
const OutletPayment = require('../models/outlet_payment');
const User = require('../models/user');

/**
 * Controller class for querying for purchases
 */
class PurchasesController {

    build(purchases = [], {
        filter = Purchase.FILTERS.SELF,
        keep_fields = [],
        show_user = false,
        show_outlet = false,
        show_post = false,
        show_assignment = false,

        build_user = {},
        build_outlet = {},
        build_post = {},
        build_assignment = {},

        user,
        trx
    } = {}) {
        if (!purchases) return Promise.resolve();

        let isArr = true;
        if (!_.isArray(purchases)) {
            isArr = false;
            purchases = [purchases];
        }
        if (!purchases.length) return Promise.resolve(purchases);

        // map: Hashmap, hash being the related id, and value being an array of post models that share that relationship
        // ids: Array of all post ids that need this relationship resolved
        // build: Array of models to call the respective Controller#build function on, after fetching all relations
        let references = {
            purchases: { map: {}, ids: [] },
            users: { build: [], map: {}, ids: [] },
            outlets: { build: [], map: {}, ids: [] },
            posts: { build: [], map: {}, ids: [] },
            assignments: { build: [], map: {}, ids: [] }
        };

        // Build array for resolving all relations at same time, also init each model
        for (let purchase of purchases) {
            let user_id = purchase.get('user_id');
            let outlet_id = purchase.get('outlet_id');
            let post_id = purchase.get('post_id');
            let assignment_id = purchase.get('assignment_id');
            
            // Model init
            purchase.columns(filter.concat(keep_fields));
            purchase.trigger('fetched', purchase);

            references.purchases.ids.push(purchase.get('id'));
            references.purchases.map[purchase.get('id')] = purchase;

            if (show_outlet) {
                if (!purchase.related('outlet').isNew()) {
                    references.outlets.build.push(purchase.relations.outlet);
                } else {
                    purchase.relations.outlet = Outlet.nullable(); // Empty models represent null values

                    if (outlet_id) {
                        if (!references.outlets.map[outlet_id]) {
                            references.outlets.map[outlet_id] = [purchase];
                            references.outlets.ids.push(outlet_id);
                        } else {
                            references.outlets.map[outlet_id].push(purchase);
                        }
                    }
                }
            } else {
                delete purchase.relations.outlet;
            }
            if (show_user) {
                if (purchase.relations.user) {
                    references.users.build.push(purchase.relations.user);
                } else {
                    purchase.relations.user = User.nullable(); // Empty models represent null values

                    if (user_id) {
                        if (!references.users.map[user_id]) {
                            references.users.map[user_id] = [purchase];
                            references.users.ids.push(user_id);
                        } else {
                            references.users.map[user_id].push(purchase);
                        }
                    }
                }
            } else {
                delete purchase.relations.user;
            }
            if (show_post) {
                if (purchase.relations.post) {
                    references.posts.build.push(purchase.relations.post);
                } else {
                    purchase.relations.post = Post.nullable(); // Empty models represent null values

                    if (post_id) {
                        if (!references.posts.map[post_id]) {
                            references.posts.map[post_id] = [purchase];
                            references.posts.ids.push(post_id);
                        } else {
                            references.posts.map[post_id].push(purchase);
                        }
                    }
                }
            } else {
                delete purchase.relations.post;
            }
            if (show_assignment) {
                if (purchase.relations.assignment) {
                    references.assignments.build.push(purchase.relations.assignment);
                } else {
                    purchase.relations.assignment = Assignment.nullable(); // Empty models represent null values

                    if (assignment_id) {
                        if (!references.assignments.map[assignment_id]) {
                            references.assignments.map[assignment_id] = [purchase];
                            references.assignments.ids.push(assignment_id);
                        } else {
                            references.assignments.map[assignment_id].push(purchase);
                        }
                    }
                }
            } else {
                delete purchase.relations.assignment;
            }
        }

        return Promise
            .all([
                // Post promise
                new Promise((yes, no) => {
                    if (!show_post) return yes();
                    Post.knex('posts')
                        .select('*')
                        .whereIn('id', references.posts.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _post = Post.forge(row);
                                references.posts.map[row.id].forEach(post => post.relations.post = _post);
                                references.posts.build.push(_post);
                            }

                            PostController
                                .build(references.posts.build, Object.assign({
                                    user: user,

                                    show_parent: true,
                                    show_owner: true,
                                    show_purchased: true,
                                    trx
                                }, build_post))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                }),
                // Outlet promise
                new Promise((yes, no) => {
                    if (!show_outlet) return yes();

                    Outlet.knex('outlets')
                        .select('*')
                        .whereIn('id', references.outlets.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _outlet = Outlet.forge(row);
                                references.outlets.map[row.id].forEach(purchase => purchase.relations.outlet = _outlet);
                                references.outlets.build.push(_outlet);
                            }

                            OutletController
                                .build(user, references.outlets.build, Object.assign({
                                    filter: Outlet.FILTERS.PREVIEW,
                                    trx
                                }, build_outlet))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                }),
                // User promise
                new Promise((yes, no) => {
                    if (!show_user) return yes();

                    User.knex('users')
                        .select('*')
                        .whereIn('id', references.users.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _user = User.forge(row);
                                references.users.map[row.id].forEach(post => post.relations.user = _user);
                                references.users.build.push(_user);
                            }

                            UserController
                                .build(user, references.users.build, Object.assign({
                                    filter: User.FILTERS.PUBLIC,
                                    show_social_stats: true,
                                    show_submission_stats: true,
                                    trx
                                }, build_user))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                }),
                // Assignment promise
                new Promise((yes, no) => {
                    if (!show_assignment) return yes();

                    Assignment.knex('assignments')
                        .select('*')
                        .whereIn('id', references.assignments.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _assignment = Assignment.forge(row);
                                references.assignments.map[row.id].forEach(post => post.relations.assignment = _assignment);
                                references.assignments.build.push(_assignment);
                            }

                            AssignmentController
                                .build(user, references.assignments.build, Object.assign({
                                    filter: Assignment.FILTERS.PREVIEW,
                                    trx
                                }, build_assignment))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                })
            ])
            .then(() => Promise.resolve(isArr ? purchases : purchases[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }
    
    /**
     * Purchasing content
     * 
     * @param {object} options
     * @param {number} options.post_id ID of the post to purchase
     * @param {number} [options.video_cost] The cost to purchase a video
     * @param {number} [options.video_fee] The Fresco fee applied to a user's video payout
     * @param {number} [options.image_cost] The cost to purchase a photo
     * @param {number} [options.image_fee] The Fresco fee applied to a user's photo payout
     * @param {object} context
     * @param {UserModel} context.user User purchasing the content
     * @param {knex.Transaction} [context.trx]
     * 
     * @returns {Promise<PurchaseModel>}
     */
    create({ post_id, video_cost = 7500, video_fee = 2500, image_cost = 3000, image_fee = 1000 } = {}, { user, trx } = {}) {
        let now = Date.now();
        let is_admin = user.can('admin', 'create', 'purchase');
        let skip_exclusivity = false;
        
        if (!user || user.related('outlet').isNew()) {
            return Promise.reject(
                ferror(ferror.FORBIDDEN).msg('You must be a member of an outlet to purchase content')
            );
        }

        return Post
            .forge({ id: post_id })
            .fetch({
                withRelated: [ 'owner', 'owner.active_payment', 'assignment', 'assignment.outlets' ],
                require: true,
                transacting: trx
            })
            .catch(Post.NotFoundError, () =>
                Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Invalid post')
                )
            )
            .then(post => {
                if (
                    // check first look (20 minutes first look timer)
                    // TODO should this be using created_at? seems like it should be from when it was verified
                    (post.has('outlet_id') && post.get('outlet_id') !== user.related('outlet').get('id') && post.get('created_at').getTime() + config.APPLICATION.DELAYS.HAS_FIRST_LOOK >= now)
                    // Check for assignment activity
                    || (post.has('assignment_id')
                        && post.related('assignment').isActive()
                        && post.related('assignment').related('outlets').models.every(m => m.get('id') !== user.related('outlet').get('id'))
                    )
                    // Check for exclusivity
                    || (post.has('exclusive_until') && now < post.get('exclusive_until').getTime() && post.get('exclusive_to') !== user.related('outlet').get('id'))
                ) {
                    // for admins, allow purchase of special content, but don't make it exclusive if they can't otherwise purchase it
                    if (is_admin) {
                        skip_exclusivity = true;
                    } else {
                        return Promise.reject(
                            ferror(ferror.INVALID_REQUEST)
                                .msg('Invalid post')
                        );
                    }
                }

                let cost = post.has('stream') ? video_cost : image_cost;
                let fee = post.has('stream') ? video_fee : image_fee;
                let is_assignment_active =
                    post.related('assignment').get('rating') === Assignment.RATING.APPROVED
                    && post.related('assignment').get('starts_at').getTime() <= now
                    && post.related('assignment').get('ends_at').getTime() >= now;

                let purchase = new Purchase({
                    assignment_id: is_assignment_active ? post.related('assignment').get('id') : null,
                    outlet_id: user.related('outlet').get('id'),
                    post_id: post.get('id'),
                    user_id: user.get('id'),
                    amount: cost,
                    fee: post.has('owner_id') ? fee : cost // fee = entire cost when content is imported
                });

                return StripeController
                    .charge
                    .create({
                        customer: user.related('outlet').get('stripe_customer_id'),
                        amount: cost,
                        destination: post.related('owner').has('stripe_account_id') ? post.related('owner').get('stripe_account_id') : undefined, // destination ONLY set when going to a user.  No destination sends directly to us.
                        application_fee: post.related('owner').has('stripe_account_id') ? fee : undefined, // application_fee ONLY set when sending money to user.  Else, money comes to us, needing no fee
                        metadata: { post_id: post.get('id') },
                        description: user.related('outlet').get('title') + ' purchased content!'
                    })
                    .then(stripe_charge => {
                        if (trx) {
                            let _options = { };
                            if (post.related('owner').has('stripe_account_id')) {
                                _options.reverse_transfer = _options.refund_application_fee = true;
                            }
                            // on error, refund the charge
                            trx.additional_rollbacks.push(() => StripeController.refund.create(stripe_charge.id, _options));
                        }

                        // finish creating purchase
                        return purchase.save({
                            stripe_charge_id: stripe_charge.id,
                            stripe_transfer_id: stripe_charge.transfer,
                            charge_status: stripe.statuses.charge[stripe_charge.status]
                        }, {
                            method: 'insert',
                            transacting: trx
                        });
                    })
                    .then(() => { // reloaf purchase fields and fetch related models required for notifications
                        return Purchase
                            .forge({ id: purchase.get('id') })
                            .fetch({
                                require: true,
                                withRelated: [
                                    'user',
                                    'assignment',
                                    'outlet',
                                    'post',
                                    'post.owner',
                                    'post.owner.active_payment'
                                ],
                                transacting: trx
                            });
                    })
                    .then(_purchase => { // set exclusivity if necessary (also update purchase reference)
                        purchase = _purchase;

                        if (is_assignment_active && !skip_exclusivity) {
                            let exclusive_until = new Date();
                            exclusive_until.setTime(exclusive_until.getTime() + config.APPLICATION.DELAYS.EXCLUSIVITY);
                            return post.save({
                                exclusive_to: user.get('outlet_id'),
                                exclusive_until
                            }, {
                                patch: true,
                                transacting: trx
                            });
                        } else {
                            return Promise.resolve(post);
                        }
                    })
                    .then(() => {
                        NotificationController.Types.Purchase.notifyOutletNewPurchase(purchase);
                        NotificationController.Types.Purchase.notifyUserNewPurchase(purchase);
                        NotificationController.Types.Purchase.notifySlackNewPurchase(purchase);
                        return purchase;
                    });
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Lists purchases for specificed outlets or user's outlet
     * @description This can take a user object optionally, if it passed, that user's outlet will be
     * used to filter purchases
     */
    list({ 
        sortBy = 'id', 
        direction = 'desc', 
        last,
        charge_status,
        limit = 20,
        page,
        outlet_ids = [],
        user_ids = [] 
    } = {}, {
        outlet,
        user,
        trx
    } = {}) {
        let is_admin = false;

        if (user) {
            is_admin = user.can('admin', 'get', 'purchase');

            let outlet_id = null;

            if(!user.related('outlet').isNew()) {
                outlet_id = parseInt(user.related('outlet').get('id'), 10);
            }

            //Permission check
            //Not an admin, so check if the outlet passed is their outlet
            if(!is_admin) {
                //Throw in their outlet id
                if(outlet_ids.length === 0 && outlet_id !== null) {
                    outlet_ids.push(outlet_id)
                } else if (outlet_id === null || outlet_ids.some(id => id !== outlet_id)) {
                    return Promise.reject(
                        ferror(ferror.FORBIDDEN).msg('You do not have permission to view these purchases!')
                    );
                }
            }
        } else if (outlet) {
            outlet_ids.push(outlet.get('id'));
        } else {
            return Promise.reject(
                ferror(ferror.FORBIDDEN).msg('You do not have permission to view these purchases!')
            );
        }

        return Purchase
            .query(qb => {
                //NEW FILTER TODO
                //Map with table prefix
                qb.select(Purchase.FILTERS.SELF.map(column => `purchases.${column}`));

                //If outlets are passed
                if(outlet_ids.length) {
                    qb.whereIn('purchases.outlet_id', outlet_ids);
                }

                //If users are passed
                if(user_ids !== null && user_ids.length > 0 && is_admin) {
                    qb.leftJoin('posts', 'purchases.post_id', 'posts.id');

                    qb.whereIn('posts.owner_id', user_ids);
                }

                //Add pagination
                Purchase.paginate(qb, { sortBy, direction, last, page, limit });
            })
            .fetchAll({ transacting: trx })
            .then(coll => Promise.resolve(coll.models))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Used to fetch the purchases of the given user's content
     * 
     * @param user_model {bookshelf.Model}
     * @param trx {knex.Transaction} optional
     * 
     * @returns {Promise}
     */
    fetchUserPurchases(user_model, trx) {
        return Purchase
            .query(qb => {
                qb.select('purchases.*')
                qb.innerJoin('posts', 'posts.id', 'purchases.post_id')
                qb.where('posts.owner_id', user_model.get('id'))
            })
            .fetchAll({ transacting: trx })
            .then(collection => collection.models)
    }

    /**
     * Generates report for client to convert to CSV 
     */
    purchaseReport({ 
        since = new Date(Date.now() - (1000 * 60 * 60 * 24 * 30)), 
        outlet_ids = [], 
        user_ids = []
    } = {},
    {
        user,
        outlet,
        trx
    } = {}) {
        const is_admin = user && user.can('admin', 'get', 'purchase');
        if (!outlet && user) {
            outlet = user.related('outlet');
        }

        if (!is_admin) {
            user_ids = [];
            outlet_ids = [ outlet.get('id') ];
        }

        return Purchase
            .query(qb => {
                qb.select(Purchase.knex.raw(`
                    purchases.created_at AS purchased_at,
                    purchases.post_id,
                    (CASE WHEN post.video IS NOT NULL THEN 'video' ELSE 'photo' END) AS post_type,
                    amount AS price,
                    fee,
                    post.assignment_id AS post_assignment_id,
                    (CASE WHEN purchases.assignment_id IS NOT NULL THEN TRUE ELSE FALSE END) AS purchased_from_assignment,
                    assignment.title AS assignment_title,
                    purchases.outlet_id,
                    outlet.title AS outlet_title,
                    user_id AS buyer_id,
                    buyer.username AS buyer_username,
                    users.id as user_id,
                    users.username as username
                `));

                qb.joinRaw(Purchase.knex.raw(`
                    INNER JOIN posts AS post ON post.id = purchases.post_id
                    INNER JOIN users AS buyer ON buyer.id = purchases.user_id
                    LEFT JOIN users ON users.id = post.owner_id
                    LEFT JOIN outlets AS outlet ON outlet.id = purchases.outlet_id
                    LEFT JOIN assignments AS assignment ON assignment.id = purchases.assignment_id
                `));

                // If users are passed
                if(user_ids.length > 0) {
                    qb.whereIn('post.owner_id', user_ids);
                }
                // If outlets are passed
                if(outlet_ids.length > 0) {
                    qb.whereIn('purchases.outlet_id', outlet_ids);
                }

                // qb.where('purchases.created_at', '>=', since);
                qb.groupBy('purchases.id', 'post.video', 'assignment.title', 'outlet.title', 'buyer.username', 'users.id', 'post.assignment_id');
                qb.orderBy('purchases.created_at', 'desc');
            })
            .fetchAll({ transacting: trx })
            .then(collection => collection.models)
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Generates time based stats for client rendering
     */
    purchaseStats(user_model, { 
        since = new Date(Date.now() - (1000 * 60 * 60 * 24 * 30)),
        outlet_ids,
        user_ids
    } = {}) {
        return new Promise((resolve, reject) => {
            let knex = Purchase.knex;
            let is_admin = user_model.can('admin', 'get', 'purchase');
            let by_outlet = outlet_ids && outlet_ids.length;
            let by_user = user_ids && user_ids.length;

            Purchase.query(qb => {
                qb.select(knex.raw(`
                    SUM(CASE WHEN purchases.created_at > CURRENT_TIMESTAMP - INTERVAL '1 DAY' THEN purchases.amount ELSE 0 END) AS revenue_last_day,
                    SUM(CASE WHEN purchases.created_at > CURRENT_TIMESTAMP - INTERVAL '7 DAYS' THEN purchases.amount ELSE 0 END) AS revenue_last_7days,
                    SUM(CASE WHEN purchases.created_at > CURRENT_TIMESTAMP - INTERVAL '30 DAYS' THEN purchases.amount ELSE 0 END) AS revenue_last_30days,
                    SUM(CASE WHEN purchases.created_at > CURRENT_TIMESTAMP - INTERVAL '365 DAYS' THEN purchases.amount ELSE 0 END) AS revenue_last_365days,
                    SUM(CASE WHEN purchases.created_at > CURRENT_DATE THEN purchases.amount ELSE 0 END) AS revenue_today,
                    SUM(CASE WHEN purchases.created_at > DATE_TRUNC('WEEK', CURRENT_DATE) THEN purchases.amount ELSE 0 END) AS revenue_this_week,
                    SUM(CASE WHEN purchases.created_at > DATE_TRUNC('MONTH', CURRENT_DATE) THEN purchases.amount ELSE 0 END) AS revenue_this_month,
                    SUM(CASE WHEN purchases.created_at > DATE_TRUNC('YEAR', CURRENT_DATE) THEN purchases.amount ELSE 0 END) AS revenue_this_year,
                    SUM(purchases.amount) AS total_revenue,
                    SUM(CASE WHEN purchases.created_at > CURRENT_TIMESTAMP - INTERVAL '1 DAY' THEN purchases.fee ELSE 0 END) AS fees_last_day,
                    SUM(CASE WHEN purchases.created_at > CURRENT_TIMESTAMP - INTERVAL '7 DAYS' THEN purchases.fee ELSE 0 END) AS fees_last_7days,
                    SUM(CASE WHEN purchases.created_at > CURRENT_TIMESTAMP - INTERVAL '30 DAYS' THEN purchases.fee ELSE 0 END) AS fees_last_30days,
                    SUM(CASE WHEN purchases.created_at > CURRENT_TIMESTAMP - INTERVAL '365 DAYS' THEN purchases.fee ELSE 0 END) AS fees_last_365days,
                    SUM(CASE WHEN purchases.created_at > CURRENT_DATE THEN purchases.fee ELSE 0 END) AS fees_today,
                    SUM(CASE WHEN purchases.created_at > DATE_TRUNC('WEEK', CURRENT_DATE) THEN purchases.fee ELSE 0 END) AS fees_this_week,
                    SUM(CASE WHEN purchases.created_at > DATE_TRUNC('MONTH', CURRENT_DATE) THEN purchases.fee ELSE 0 END) AS fees_this_month,
                    SUM(CASE WHEN purchases.created_at > DATE_TRUNC('YEAR', CURRENT_DATE) THEN purchases.fee ELSE 0 END) AS fees_this_year,
                    SUM(purchases.fee) AS total_fees
                `));

                if(by_outlet) {
                    qb.whereIn('purchases.outlet_id', is_admin ? outlet_ids : user_model.related('outlet').get('id'));
                }


                if(user_ids && is_admin) {
                    //Join on posts to get the user who created the post
                    qb.leftJoin('posts', 'purchases.post_id', 'posts.id');
                    qb.whereIn('posts.owner_id', user_ids);
                }
            })
            .fetch()
            .then(stat => {
                if (stat.get('last_day') === null) {
                    resolve({
                        revenue_last_day: 0,
                        revenue_last_7days: 0,
                        revenue_last_30days: 0,
                        revenue_last_365days: 0,
                        revenue_today: 0,
                        revenue_this_week: 0,
                        revenue_this_month: 0,
                        revenue_this_year: 0,
                        total_revenue: 0,
                        fees_last_day: 0,
                        fees_last_7days: 0,
                        fees_last_30days: 0,
                        fees_last_365days: 0,
                        fees_today: 0,
                        fees_this_week: 0,
                        fees_this_month: 0,
                        fees_this_year: 0,
                        total_fees: 0
                    });
                }
                else {
                    resolve(stat);
                }
            })
            .catch(ferror.constraint(reject));
        });
    }

}

module.exports = new PurchasesController;

const AssignmentController = require('./Assignment');
const NotificationController = require('./Notification');
const OutletController = require('./Outlet');
const PostController = require('./Post');
const UserController = require('./User');
const StripeController = require('./Stripe');