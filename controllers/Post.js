'use strict';

const config = require('../config');

const _  = require('lodash');
const Promise    = require('bluebird');
const mime = require('mime')

const ferror = require('../lib/frescoerror');
const hashids = require('../lib/hashids');
const knex = require('../lib/bookshelf').knex;
const reporter = require('../lib/reporter');

const Assignment = require('../models/assignment');
const User = require('../models/user');
const Post = require('../models/post');
const Gallery = require('../models/gallery');

class PostController {

    /**
     * Takes the post(s) and formats them for serving,
     * returning the proper columns and relations for each.
     *
     * @param post_models {Model|Model[]}
     * @param options {object}
     * @param options.user {bookshelf.Model}
     * @param options.outlet {bookshelf.Model}
     * @param options.filter {string[]}
     * @param options.show_parent {bool}
     * @param options.show_owner {bool}
     * @param options.show_curator {bool}
     * @param options.show_purchased {bool} Attaches the purchased flag for outlets
     *
     * @returns {Promise<bookshelf.Model[]}
     */
    build(post_models, {
        user,
        outlet,

        filter = Post.FILTERS.PUBLIC,
        keep_fields = [],
        show_parent = false,
        show_owner = false,
        show_curator = false,
        show_purchased = false,

        build_parent = {},
        build_owner = {},
        build_curator = {},

        trx
    } = {}) {
        if (!post_models) return Promise.resolve();

        let isArr = true;
        if (!_.isArray(post_models)) {
            isArr = false;
            post_models = [post_models];
        }
        if (!post_models.length) return Promise.resolve(post_models);

        // map: Hashmap, hash being the related id, and value being an array of post models that share that relationship
        // ids: Array of all post ids that need this relationship resolved
        // build: Array of models to call the respective Controller#build function on, after fetching all relations
        let references = {
            posts: { map: {}, ids: [] },
            curators: { build: [], map: {}, ids: [] },
            owners: { build: [], map: {}, ids: [] },
            parents: { build: [], map: {}, ids: [] }
        };

        // Build array for resolving all relations at same time, also init each model
        for (let post_model of post_models) {
            let owner_id = post_model.get('owner_id');
            let curator_id = post_model.get('curator_id');
            let parent_id = post_model.get('parent_id');

            // Model init
            post_model.columns(filter.concat(keep_fields));
            post_model.trigger('fetched', post_model);

            references.posts.ids.push(post_model.get('id'));
            references.posts.map[post_model.get('id')] = post_model;

            if (show_owner) {
                if (post_model.relations.owner && !post_model.related('owner').isNew()) {
                    references.owners.build.push(post_model.relations.owner);
                } else {
                    post_model.relations.owner = User.nullable(); // Empty models represent null values

                    if (owner_id) {
                        if (!references.owners.map[owner_id]) {
                            references.owners.map[owner_id] = [post_model];
                            references.owners.ids.push(owner_id);
                        } else {
                            references.owners.map[owner_id].push(post_model);
                        }
                    }
                }
            } else {
                delete post_model.relations.owner;
            }
            if (show_curator) {
                if (post_model.relations.curator) {
                    references.curators.build.push(post_model.relations.curator);
                } else {
                    post_model.relations.curator = User.nullable(); // Empty models represent null values

                    if (curator_id) {
                        if (!references.curators.map[curator_id]) {
                            references.curators.map[curator_id] = [post_model];
                            references.curators.ids.push(curator_id);
                        } else {
                            references.curators.map[curator_id].push(post_model);
                        }
                    }
                }
            } else {
                delete post_model.relations.curator;
            }
            if (show_parent) {
                if (post_model.relations.parent) {
                    references.parents.build.push(post_model.relations.parent);
                } else {
                    post_model.relations.parent = Gallery.nullable(); // Empty models represent null values

                    if (parent_id) {
                        if (!references.parents.map[parent_id]) {
                            references.parents.map[parent_id] = [post_model];
                            references.parents.ids.push(parent_id);
                        } else {
                            references.parents.map[parent_id].push(post_model);
                        }
                    }
                }
            } else {
                delete post_model.relations.parent;
            }
            if (show_purchased && (outlet || (user && !user.related('outlet').isNew()))) {
                post_model.set('purchased', false);
            } else {
                post_model.unset('purchased');
                show_purchased = false;
            }
        }

        return Promise
            .all([
                // Parent gallery promise
                new Promise((yes, no) => {
                    if (!show_parent) return yes();
                    Gallery.knex('galleries')
                        .select('*')
                        .whereIn('id', references.parents.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _parent = Gallery.forge(row);
                                references.parents.map[row.id].forEach(post => post.relations.parent = _parent);
                                references.parents.build.push(_parent);
                            }

                            GalleryController
                                .build(user, references.parents.build, Object.assign({
                                    filter: Gallery.FILTERS.PREVIEW,
                                    trx
                                }, build_parent))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                }),
                // Owner promise
                new Promise((yes, no) => {
                    if (!show_owner) return yes();
                    User.knex.from('users')
                        .whereIn('id', references.owners.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _owner = User.forge(row);
                                references.owners.map[row.id].forEach(post => post.relations.owner = _owner);
                                references.owners.build.push(_owner);
                            }

                            UserController
                                .build(user, references.owners.build, Object.assign({
                                    filter: User.FILTERS.PUBLIC,
                                    show_social_stats: true,
                                    show_submission_stats: true,
                                    show_blocked: true,
                                    show_disabled: true,
                                    trx
                                }, build_owner))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                }),
                // Curator promise
                new Promise((yes, no) => {
                    if (!show_curator) return yes();

                    User.knex.from('users')
                        .whereIn('id', references.curators.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _curator = User.forge(row);
                                references.curators.map[row.id].forEach(post => post.relations.curator = _curator);
                                references.curators.build.push(_curator);
                            }

                            UserController
                                .build(user, references.curators.build, Object.assign({
                                    filter: User.FILTERS.PREVIEW,
                                    trx
                                }, build_curator))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                }),
                // Purchased promise
                new Promise((yes, no) => {
                    if (!show_purchased) return yes();

                    let outlet_id;
                    if (user && !user.isNew() && !user.related('outlet').isNew()) outlet_id = user.related('outlet').get('id');
                    else if (outlet && !outlet.isNew()) outlet_id = outlet.get('id')

                    else return yes();

                    Post.knex
                        .from('purchases')
                        .select('post_id')
                        .where('outlet_id', outlet_id)
                        .whereIn('post_id', references.posts.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                references.posts.map[row.post_id].set('purchased', true);
                            }
                            yes();
                        })
                        .catch(no);
                })
            ])
            .then(() => Promise.resolve(isArr ? post_models : post_models[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Used for building posts passed via the `posts_new` parameter.
     *
     * NOTE the promise returns an array of upload urls, not post models
     *
     * @param user {Model}
     * @param gallery_model {Model}
     * @param posts_new {object[]}
     * @param type {string}
     * @param trx {Transaction}
     *
     * @returns {Promise}
     */
    makeBulk({ gallery_model, posts_new = [], type = 'import' } = {}, { user, trx } = {}) {
        let new_models = []
        return Promise
            .map(posts_new, (post_info, index) => {
                if (post_info.rating && post_info.rating > Post.RATING.UNRATED && !user.can('admin', 'create', 'post')) {
                    return Promise.reject(
                        ferror(ferror.FORBIDDEN)
                            .param(`posts_new[${index}]`)
                            .value(post_info)
                            .msg("Must have admin privileges to rate posts")
                    );
                }

                // The key of the post file(s) on S3
                post_info.key = AWSController.genKey({ postfix: type });

                post_info.raw = post_info.key + '.' + mime.extension(post_info.contentType)

                if (post_info.contentType.includes('image/')) {
                    post_info.image = config.AWS.CLOUDFRONT.PHOTO_URL + post_info.key + config.AWS.CLOUDFRONT.IMAGE_EXTENSION;
                } else if (post_info.contentType.includes('video/')) {
                    post_info.image = config.AWS.CLOUDFRONT.THUMB_URL + AWSController.genThumbnailKey(post_info.key);
                    post_info.video = config.AWS.CLOUDFRONT.VIDEO_URL + post_info.key + config.AWS.CLOUDFRONT.VIDEO_EXTENSION;
                    post_info.stream = config.AWS.CLOUDFRONT.STREAM_URL + post_info.key + config.AWS.CLOUDFRONT.STREAM_EXTENSION;
                } else {
                    return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .param(`posts_new[${index}][contentType]`)
                            .value(post_info.contentType)
                            .msg('Invalid media type. Expecting either image or video.')
                    );
                }

                post_info.parent_id = gallery_model.get('id');
                if (type === 'submission') {
                    post_info.owner_id = user.get('id');
                } else {
                    post_info.curator_id = user.get('id');
                }

                if (post_info.lat && post_info.lng) {
                    post_info.location = {
                        type: 'Point',
                        coordinates: [post_info.lng, post_info.lat]
                    }
                }

                return new Post(post_info)
                    .save(null, { method: 'insert', transacting: trx })
                    .then(post_model => {
                        new_models.push(post_model)
                        post_info.post_id = post_model.get('id')
                        return SubmissionsController.createURLs(type, post_info)
                    })
            })
            .then(uploads =>
                gallery_model
                    .posts()
                    .attach(new_models, { transacting: trx })
                    .then(() => Promise.resolve(uploads))
            )
            .then(result => {
                if (type === 'submission') {
                    // Initialize failed submission alert
                    NotificationController.Types.Submission
                        .initUploadFailedAlert(gallery_model.get('id'), new_models.map(m => m.get('id')));
                }

                return result;
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }
    makeBulkImports(arg1 = {}, arg2 = {}) {
        arg1.type = 'import';
        return this.makeBulk(arg1, arg2);
    }
    makeBulkSubmissions(arg1 = {}, arg2 = {}) {
        arg1.type = 'submission';
        return this.makeBulk(arg1, arg2);
    }

    /**
     * Get the provided post(s)
     *
     * @param user_model {Model}
     * @param ids {int|int[]}
     *
     * @returns {Promise}
     */
    get(ids = [], { user, outlet, trx } = {}) {
        let isArr = true;
        if (!_.isArray(ids)) {
            isArr = false;
            ids = [ids];
        }

        return Post
            .query(qb => {
                qb.select(Post.GEO_FILTERS.PUBLIC);
                qb.whereIn('id', ids);
                qb.limit(ids.length);

                Post.QUERIES.VISIBLE(qb, { user, outlet });
            })
            .fetchAll({
                transacting: trx
            })
            .then(coll => {
                if (coll.length !== ids.length) {
                    return Promise.reject(
                        ferror(ferror.NOT_FOUND)
                            .msg('Invalid post(s)')
                    );
                }

                return Promise.resolve(isArr ? coll.models : coll.models[0]);
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Get all of the user's submissions (posts)
     *
     * @param user_model {Model}
     * @param user_id {int}
     * @param pagination {Object}
     * @returns {Promise}
     */
    getByUser(user_id, { rating = Post.RATING.VERIFIED, status = Post.STATUS.COMPLETE, sortBy = 'id', direction = 'desc', limit = 20, last, page } = {}, { user, outlet, trx } = {}) {
        return Post
            .query(qb => {
                qb.select(Post.GEO_FILTERS.PUBLIC);
                qb.where('owner_id', user_id || user_model.get('id'));

                if (status != null) {
                    if (_.isArray(status)) {
                        qb.whereIn('posts.status', status);
                    }
                    else {
                        qb.where('posts.status', status);
                    }
                }

                if (rating != null) {
                    if (_.isArray(rating)) {
                        qb.whereIn('posts.rating', rating);
                    }
                    else {
                        qb.where('posts.rating', rating);
                    }
                }

                Post.paginate(qb, { sortBy, direction, limit, page, last });
            })
            .fetchAll({ transacting: trx })
            .then(coll => Promise.resolve(coll.models))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Updates post
     */
    update(user_model, post_id, updates = {}, trx) {
        if (!user_model.can('admin', 'update', 'post')) {
            return Promise.reject(ferror(ferror.FORBIDDEN));
        }

        let force_verify_notifs = updates.verified;
        delete updates.verified;

        let old_assignment_id
        let old_rating
        updates.updated_at = new Date();

        let post_model = Post.forge({ id: post_id })
        return post_model
            .fetch({
                require: true,
                columns: Post.GEO_FILTERS.ALL,
                transacting: trx
            })
            .then(() => {
                old_assignment_id = post_model.get('assignment_id');
                old_rating = post_model.get('rating');

                return post_model
                    .save(updates, { patch: true, transacting: trx })
                    .then(() => (post_model.has('assignment_id')) // load assignment, if post has one
                        ? post_model.load('assignment', { transacting: trx })
                        : Promise.resolve()
                    );
            })
            .then(() => { // affected assignment logic
                let operations = []
                if ( // only apply if post has assignment & is being verified
                    post_model.has('assignment_id')
                    && post_model.get('rating') === Post.RATING.VERIFIED
                    && old_rating < Post.RATING.VERIFIED
                ) {
                    let _assignment = post_model.related('assignment');
                    let _now = Date.now();
                    let _ends_at_dt = _assignment.get('ends_at');
                    // If submission comes in close to expiration, delay the assignment expiration time
                    if (_ends_at_dt.getTime() > _now && _ends_at_dt.getTime() < _now + config.APPLICATION.DELAYS.ASSIGNMENT.REFRESH) {
                        _ends_at_dt.setTime(_ends_at_dt.getTime() + config.APPLICATION.DELAYS.ASSIGNMENT.REFRESH);
                        operations.push(
                            _assignment.save({ ends_at: _ends_at_dt }, { patch: true, transacting: trx })
                        );
                    }
                }

                return Promise.all(operations);
            })
            .then(() => { // notification logic
                if (post_model.get('rating') === Post.RATING.VERIFIED) { // only notify on verified content
                    // Location alerts on location update
                    if (force_verify_notifs || post_model.hasChanged('location')) {
                        OutletController.Location.contentAlert(post_model, trx).catch(reporter.report);
                    }
                    // Assignment alert if...
                    if (post_model.get('assignment_id') && (
                        force_verify_notifs // ...we are forcing it,
                        || old_rating < Post.RATING.VERIFIED // ...we are newly verifying it,
                        || post_model.get('assignment_id') != old_assignment_id // ...or we are changing the assignment
                    )) {
                        AssignmentController.contentAlert(post_model, trx).catch(reporter.report);
                    }
                }
            })
            .then(() => post_model) // Return the post model
            .catch(Post.NotFoundError, () =>
                Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Invalid post'))
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Removes post and any references in Galleries.
     *
     * @param posts_ids
     * @param trx
     * @returns {Promise}
     */
    delete(user_model, posts_ids, trx) {
        if (!Array.isArray(posts_ids)) posts_ids = [posts_ids];

        return new Promise((resolve, reject) => {
            Post
                .where(qb => qb.whereIn('id', posts_ids))
                .destroy({ require: true, transacting: trx })
                .then(() => resolve({ success: 'ok' }))
                .catch(Post.NoRowsDeletedError, ferror(ferror.NOT_FOUND).trip(reject))
                .catch(ferror.constraint(reject));
        });
    }

    /**
     * Used to created a signed url for downloading the raw version
     * of purchased content
     *
     * @param {User} user_model
     * @param {number} post_id
     * @param {knex.Transaction} trx
     *
     * @returns {Promise}
     */
    download(post_id, { user, outlet, client, trx } = {}) {
        if (user && !outlet) outlet = user.related('outlet');

        let check_purchases = !user || !user.can('admin', 'get', 'post')
        if (check_purchases) {
            if (!outlet || outlet.isNew()) {
                return Promise.reject(ferror(ferror.FORBIDDEN))
            }
        }
        // TODO TEMP
        if (check_purchases && client && client.related('role').get('scopes').includes('3rd-party-temp:post:get')) {
            check_purchases = false
        }

        return Post
            .query(qb => {
                qb.select('posts.*')
                qb.where('posts.id', post_id)
                if (check_purchases) {
                    qb.innerJoin('purchases', 'purchases.post_id', 'posts.id')
                    qb.where('purchases.outlet_id', outlet.get('id'))
                }
            })
            .fetch({
                require: true,
                withRelated: [ 'owner', 'assignment' ],
                transacting: trx
            })
            .then(post => {
                notifySlack(post, user, outlet);

                return Promise.resolve(
                    post.has('raw')
                        ? AWSController.generateDownloadURL(
                            config.AWS.S3.UPLOAD_DIRECTORY + post.get('raw'),
                            300
                        )
                        : (
                            post.has('video')
                                ? post.get('video')
                                : post.get('image')
                        )
                );
            })
            .catch(Post.NotFoundError, () =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('Purchase of this post not found'))
            )
            .catch(err => Promise.reject(ferror.constraint(err)));

            function notifySlack(post, user, outlet) {
                //TODO Remove from here, temp. hotfix to not overflow downloads channel
                //These stations are under the new pricing model
                //4/13/17
                const outletsToNotify = ['145', '295', '297'];

                if(outletsToNotify.indexOf(outlet.get('id')) == -1) return;

                let owner = post.related('owner');
                let assignment = post.related('assignment');
                let message = owner.isNew()
                    ? 'Imported'
                    : `<${config.SERVER.WEB_ROOT}user/${hashids.encode(owner.get('id'))}|_${owner.name()}_>'s`;
                message += ` <${config.SERVER.WEB_ROOT}post/${hashids.encode(post.get('id'))}|*`;
                message += post.has('stream') ? 'Video' : 'Photo';
                message += '*> downloaded by ';
                message += `<${config.SERVER.WEB_ROOT}user/${hashids.encode(user.get('id'))}|${user.name()}> `
                message += `from the outlet <${config.SERVER.WEB_ROOT}outlet/${hashids.encode(outlet.get('id'))}|_${outlet.get('title')}_>!`;

                if (!assignment.isNew()) {
                    message += '\nDownload made from assignment: '
                    message += `<${config.SERVER.WEB_ROOT}assignment/${hashids.encode(assignment.get('id'))}|_${assignment.get('title')}_>`;
                }

                NotificationController.Mediums.Slack
                    .send({
                        message,
                        channel: config.SLACK.CHANNELS.DOWNLOADS
                    })
                    .catch(reporter.report);
            }
    }

    list({
        created_after,
        created_before,
        type,
        geo,
        radius = 0,
        where = 'intersects',
        rating = Post.RATING.VERIFIED,
        sortBy = 'created_at',
        direction = 'desc',
        last,
        page,
        limit = 20
    } = {}, {
        user,
        outlet,
        trx
    } = {}) {
        return Post
            .query(qb => {
                qb.select(Post.GEO_FILTERS.PUBLIC);
                Post.QUERIES.PURCHASED(qb, { user, outlet });
                Post.QUERIES.VISIBLE(qb, { user, outlet, status: Post.STATUS.COMPLETE });

                if (rating !== undefined) {
                    if (_.isArray(rating)) {
                        qb.whereIn('posts.rating', rating);
                    } else {
                        qb.where('posts.rating', rating);
                    }

                    // If you are requesting unrated content, only return YOUR unrated content
                    if (
                        !(user && user.can('admin', 'get', 'post'))
                        && (
                            rating === Post.RATING.UNRATED
                            || (_.isArray(rating) && rating.includes(Post.RATING.UNRATED))
                        )
                    ) {
                        qb.where(_qb => {
                            _qb.where('posts.rating', '!=', Post.RATING.UNRATED);
                            if (user) _qb.orWhere('posts.owner_id', user.get('id'));
                        });
                    }
                }

                qb.leftJoin('users', 'posts.owner_id', 'users.id');
                User.QUERIES.ACTIVE(qb);
                if (user) User.QUERIES.BLOCKING_FILTER(qb, { user });

                if (geo) {
                    Post.queryGeo(qb, { geoJson: geo, radius, where });
                }

                if (created_after) {
                    qb.where('posts.created_at', '>', created_after);
                }
                if (created_before) {
                    qb.where('posts.created_at', '<', created_after);
                }

                if (type) {
                    qb[type === 'video' ? 'whereNotNull' : 'whereNull']('posts.video');
                }

                Post.paginate(qb, { sortBy, direction, last, page, limit });
            })
            .fetchAll({ transacting: trx })
            .then(coll => coll.models)
            .catch(err =>
                Promise.reject(ferror.constraint(err))
            );
    }

    /**
     * This is a temporary controller function in place of a unified method of
     * fetching a list of posts and the total count of the unpaginated list.
     * It is a duplicate of the PostController#list function.
     */
    mrss({
        user_ids,
        created_after,
        created_before,
        type,
        geo,
        radius = 0,
        where = 'intersects',
        rating = Post.RATING.VERIFIED,
        sortBy = 'created_at',
        direction = 'desc',
        last,
        page,
        limit = 20,
        tags
    } = {}, {
        user,
        outlet,
        trx
    } = {}) {
        return Post
            .query(qb => {
                let filterQb = Post.knex.queryBuilder(); // used to first filter based on the post query
                let counterQb = Post.knex.queryBuilder(); // used to count total results based on the filter qb
                let positionQb = Post.knex.queryBuilder(); // used to finally calculate the index of the post in its parent

                filterQb.from('posts');
                filterQb.select(Post.knex.raw('COUNT(*) OVER() AS __result_count'), 'posts.*');
                filterQb.leftJoin('users', 'posts.owner_id', 'users.id');
                User.QUERIES.ACTIVE(filterQb);
                Post.QUERIES.PURCHASED(filterQb, { user, outlet });
                Post.QUERIES.VISIBLE(filterQb, { user, outlet, status: Post.STATUS.COMPLETE });
                if (user) User.QUERIES.BLOCKING_FILTER(filterQb, { user });

                if (rating !== undefined) {
                    if (_.isArray(rating)) {
                        filterQb.whereIn('posts.rating', rating);
                    } else {
                        filterQb.where('posts.rating', rating);
                    }

                    // If you are requesting unrated content, only return YOUR unrated content
                    if (
                        !(user && user.can('admin', 'get', 'post'))
                        && (
                            rating === Post.RATING.UNRATED
                            || (_.isArray(rating) && rating.includes(Post.RATING.UNRATED))
                        )
                    ) {
                        filterQb.where(function() {
                            this.where('posts.rating', '!=', Post.RATING.UNRATED);
                            if (user) this.orWhere('posts.owner_id', user.get('id'));
                        });
                    }
                }

                if (Array.isArray(user_ids)) {
                    filterQb.whereIn('posts.owner_id', user_ids);
                }

                if (geo) {
                    Post.queryGeo(filterQb, { geoJson: geo, radius, where });
                }

                if (created_after) {
                    filterQb.where('posts.created_at', '>', created_after);
                }
                if (created_before) {
                    filterQb.where('posts.created_at', '<', created_after);
                }

                if (type) {
                    filterQb[type === 'video' ? 'whereNotNull' : 'whereNull']('posts.video');
                }

                if (tags) {
                    filterQb.leftJoin('galleries', 'posts.parent_id', 'galleries.id');
                    filterQb.whereRaw('"galleries"."tags" @> ?', [tags]);
                }

                counterQb.select('*');
                counterQb.from(Post.knex.raw(`(${filterQb.toString()}) AS posts`));
                Post.paginate(counterQb, { sortBy, direction, last, page, limit });

                // returns, in the form {position, total count}::int[], the index of the post within the parent gallery
                positionQb.from(Post.knex.raw('"posts" AS _p'));
                positionQb.select(
                    Post.knex.raw(`ARRAY[
                        SUM(CASE WHEN ?? <= ?? THEN 1 ELSE 0 END),
                        COUNT(*)
                    ]`, ['_p.id', 'counterqb.id'])
                );
                positionQb.whereRaw('?? = ??', ['_p.parent_id', 'counterqb.parent_id']);

                let columns = Post.GEO_FILTERS.PUBLIC.map(c => knex.raw(c.toString().replace('posts', 'counterqb')));

                qb.select('counterqb.__result_count', Post.knex.raw(`(${positionQb.toString()}) AS index`), ...columns);
                qb.from(Post.knex.raw(`(${counterQb.toString()}) AS counterqb`));
            })
            .fetchAll({ transacting: trx })
            .then(coll => {
                let total = 0;
                coll.models.forEach(model => {
                    total = model.get('__result_count');
                    model.unset('__result_count');
                });

                return {
                    totalCount: total,
                    posts: coll.models
                };
            })
            .catch(err =>
                Promise.reject(ferror.constraint(err))
            );
    }

    /**
     * Search for posts using fulltext search
     *
     * NOTE: This query has a special case in its ORDER BY
     * clause, where if ordering by captured_at, it must
     * be coalesced with created_at to include all content
     * without a captured_at meta field.
     *
     * @param {Model} user_model
     * @param {Object} options
     * @param {String} options.q
     * @param {ISODate} options.before
     * @param {ISODate} options.after
     * @param {GeoJSON} options.geo
     * @param {String} options.geo_where
     * @param {Integer} options.last
     * @param {Integer} options.limit
     * @param {String} options.post_type
     */
    search(
        user_model,
        {
            q,
            rating,
            created_before,
            created_after,
            tags,
            geo,
            radius = 0,
            geo_where = 'intersects',
            last,
            limit = 10,
            post_type,
            sortBy = 'created_at',
            direction = 'desc',
            count = true,
        } = {},
        trx
    ) {
        q = q && q.trim ? q.trim() : q;

        // TODO finish fixing
        return Post
            .query(qb => {
                let last_qb = Post.knex('posts').select('posts.*').where('posts.id', last).limit(1);
                let inner_qb = Post.knex('posts')
                    .select('posts.*')
                    .innerJoin('galleries', 'galleries.id', 'posts.parent_id');

                if (count) inner_qb.select(Post.knex.raw('COUNT(*) OVER() AS __result_count'));

                Post.QUERIES.VISIBLE(inner_qb, { user: user_model, status: Post.STATUS.COMPLETE });

                if (post_type == 'photo') {
                    inner_qb.whereNull('posts.video');
                }
                else if (post_type == 'video') {
                    inner_qb.whereNotNull('posts.video');
                }

                // FTS query if querystring provided
                if (q) {
                    inner_qb.from(Post.knex.raw('PLAINTO_OR_TSQUERY(?) AS "_fts_query", posts', [q]))
                    inner_qb.select(Post.knex.raw('TS_RANK("galleries"."_fts", "_fts_query") AS "_fts_rank"'))
                    inner_qb.whereRaw('?? @@ ??', ['galleries._fts', '_fts_query']);
                    // sortBy = '_fts_rank';

                    if (last) {
                        last_qb.leftJoin('galleries', 'galleries.id', 'posts.parent_id')
                        last_qb.select(Post.knex.raw('TS_RANK("galleries"."_fts", PLAINTO_OR_TSQUERY(?)) AS "_fts_rank"', [q]));
                    }
                }

                // Query by timestamp, if provided
                if (created_before) {
                    inner_qb.where('"posts"."created_at"', '<', created_before);
                }
                if (created_after) {
                    inner_qb.where('"posts"."created_at"', '>', created_after);
                }
                if (geo) {
                    Post.queryGeo(inner_qb, { geoJson: geo, radius, where: geo_where });
                }
                if (tags) {
                    if (!_.isArray(tags)) tags = [tags];
                    inner_qb.whereRaw('"galleries"."tags" @> ?', [tags]);
                }
                if (_.isArray(rating)) {
                    inner_qb.whereIn('posts.rating', rating.filter(n => !isNaN(n)));
                } else if (!isNaN(rating)) {
                    inner_qb.where('posts.rating', rating);
                }

                let from_query = `(${inner_qb.toString()}) AS posts`;

                if (last) {
                    qb.where(function() {
                        if (sortBy === 'captured_at') { // Special coalesce case
                            this.where(
                                Post.knex.raw('COALESCE(posts.captured_at, posts.created_at)'),
                                direction === 'asc' ? '>' : '<',
                                Post.knex.raw('COALESCE(last_post.captured_at, last_post.created_at)')
                            )
                            this.orWhere(function() {
                                this.where(
                                    Post.knex.raw('COALESCE(posts.captured_at, posts.created_at)'),
                                    Post.knex.raw('COALESCE(last_post.captured_at, last_post.created_at)')
                                );
                                this.where('posts.id', direction === 'asc' ? '>' : '<', Post.knex.raw('last_post.id'));
                            });
                        } else {
                            this.where('posts.' + sortBy, direction === 'asc' ? '>' : '<', Post.knex.raw('last_post.' + sortBy))
                            this.orWhere(function() {
                                this.where('posts.' + sortBy, Post.knex.raw('last_post.' + sortBy));
                                this.where('posts.id', direction === 'asc' ? '>' : '<', Post.knex.raw('last_post.id'));
                            });
                        }
                    });
                    from_query += `, (${last_qb.toString()}) AS last_post`
                }

                qb.from(Post.knex.raw(from_query));
                qb.select(...Post.GEO_FILTERS.ALL);
                if (count) qb.select('posts.__result_count');

                // Special coalesce case
                if (sortBy === 'captured_at') qb.orderBy(Post.knex.raw('COALESCE(posts.captured_at, posts.created_at)'), direction);
                else qb.orderBy('posts.' + sortBy, direction);

                qb.orderBy('posts.id', 'desc');
                qb.limit(limit);
            })
            .fetchAll({ transacting: trx })
            .then(post_collection => {
                let result = { results: post_collection.models };

                if (count) {
                    let _count = 0;
                    for (let post_model of post_collection.models) {
                        _count = parseInt(post_model.get('__result_count'), 10);
                        post_model.unset('__result_count');
                    }
                    result.count = _count;
                }

                return result;
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }
}

module.exports = new PostController;

// Avoid circular relationships
const AssignmentController = require('./Assignment');
const AWSController = require('./AWS');
const GalleryController = require('./Gallery');
const NotificationController = require('./Notification');
const OutletController = require('./Outlet');
const SubmissionsController = require('./Submission');
const UserController = require('./User');