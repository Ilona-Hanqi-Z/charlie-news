'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const superagent = require('superagent');

const config = require('../../config');

const ferror = require('../../lib/frescoerror');
const twitter = require('../../lib/twitter');
const hashids = require('../../lib/hashids');
const reporter = require('../../lib/reporter');

const Article = require('../../models/article');
const Assignment = require('../../models/assignment');
const Comment = require('../../models/comment');
const Gallery = require('../../models/gallery');
const GalleryReport = require('../../models/gallery_report');
const GalleryRepost = require('../../models/gallery_repost');
const Post = require('../../models/post');
const Report = require('../../models/report');
const Story = require('../../models/story');
const User = require('../../models/user');

class GalleryController {

    /**
     * Attaches stats and social fields to gallery(ies)
     * 
     * TODO
     *  To update a build function:
     *      1) fix use of trx
     *      5) remove outer promise
     *      2) implement "references" variable
     *      6) unset when show_x is false
     *      3) build_(model)
     *      4) Stop doing shit like user_model.set('outlet'...), do user_model.relations.outlet = ...
     * 
     * @param galleries
     * @param user_model
     */
    build(user_model, galleries, {
        filter = Gallery.FILTERS.PUBLIC,
        keep_fields = [],
        rating,
        show_owner = false,
        show_curator = false,
        show_stories = false,
        show_articles = false,
        show_posts = false,
        show_stats = false,
        show_report_stats = false,
        show_assignment = false,

        build_owner = {},
        build_curator = {},
        build_posts = {},
        build_stories = {},
        build_articles = {},
        build_assignments = {},

        trx
    } = {}) {
        if (!galleries) return Promise.resolve();

        let isArr = true;
        if(!_.isArray(galleries)) {
            isArr = false;
            galleries = [galleries];
        }
        if (galleries.length === 0) return Promise.resolve(galleries);

        // map: Hashmap, hash being the related id, and value being an array of gallery models that share that relationship
        // ids: Array of all gallery ids that need this relationship resolved
        // build: Array of models to call the respective Controller#build function on, after fetching all relations
        let references = {
            galleries: { map: {}, ids: [] },
            articles: { build: [], ids: [] },
            assignments: { build: [] },
            posts: { build: [], ids: [] },
            stories: { build: [], ids: [] },
            curators: { build: [], map: {}, ids: [] },
            owners: { build: [], map: {}, ids: [] },
        };

        for (let gallery of galleries) {
            let _gallery_id = gallery.get('id');
            let _owner_id = gallery.get('owner_id');
            let _curator_id = gallery.get('curator_id');
            
            gallery.columns(filter.concat(keep_fields));
            gallery.trigger('fetched', gallery);

            references.galleries.ids.push(_gallery_id);
            references.galleries.map[_gallery_id] = gallery;

            // If the highlighted_at time is in the future, set it to null for any non-admin users
            if (
                (!user_model || !user_model.can('admin', 'get', 'gallery'))
                && gallery.has('highlighted_at')
                && gallery.get('highlighted_at').getTime() > Date.now()
            ) {
                gallery.set('highlighted_at', null);
            }

            // NOTE defaults are set below because if galleries have no results
            // in the corresponding query, they will not be included in the
            // query results

            if (show_owner) {
                if (gallery.relations.owner) {
                    references.owners.build.push(gallery.relations.owner);
                } else {
                    gallery.relations.owner = User.nullable(); // Empty models represent null values

                    if (_owner_id) {
                        if (!references.owners.map[_owner_id]) {
                            references.owners.map[_owner_id] = [gallery];
                            references.owners.ids.push(_owner_id);
                        } else {
                            references.owners.map[_owner_id].push(gallery);
                        }
                    }
                }
            } else {
                delete gallery.relations.owner;
            }
            if (show_curator) {
                if (gallery.relations.curator) {
                    references.curators.build.push(gallery.relations.curator);
                } else {
                    gallery.relations.curator = User.nullable();

                    if (_curator_id) {
                        if (!references.curators.map[_curator_id]) {
                            references.curators.map[_curator_id] = [gallery];
                            references.curators.ids.push(_curator_id);
                        } else {
                            references.curators.map[_curator_id].push(gallery);
                        }
                    }
                }
            } else {
                delete gallery.relations.curator;
            }
            if (show_stories) {
                // Make a default empty array for galleries without stories
                if (gallery.relations.stories) {
                    gallery.relations.stories.models = gallery.relations.stories.models.slice(0, 3);
                    references.stories.build = references.stories.build.concat(gallery.relations.stories.models);
                } else {
                    gallery.relations.stories = Story.Collection.forge();
                    references.stories.ids.push(_gallery_id);
                }
            } else {
                delete gallery.relations.stories;
            }
            if (show_posts) {
                // Make a default empty array for galleries without posts
                if (gallery.relations.posts) {
                    references.posts.build = references.posts.build.concat(gallery.relations.posts.models);
                } else {
                    gallery.relations.posts = Post.Collection.forge();
                    references.posts.ids.push(_gallery_id);
                }
            } else {
                delete gallery.relations.posts;
            }
            if (show_articles) {
                // Make a default empty array for galleries without articles
                if (gallery.relations.articles) {
                    gallery.relations.articles = gallery.relations.articles.slice(0, 3);
                    references.articles.build = references.articles.build.concat(gallery.relations.articles.models);
                } else {
                    gallery.relations.articles = Article.Collection.forge();
                    references.articles.ids.push(_gallery_id);
                }
            } else {
                delete gallery.relations.articles;
            }
            if (show_stats) {
                // Set default stats
                gallery.set('photo_count', 0);
                gallery.set('video_count', 0);
                gallery.set('likes', 0);
                gallery.set('reposts', 0);
                gallery.set('comments', 0);
                if (user_model) {
                    gallery.set('liked', false);
                    gallery.set('reposted', false);
                }
            } else {
                gallery.unset('photo_count');
                gallery.unset('video_count');
                gallery.unset('likes');
                gallery.unset('reposts');
                gallery.unset('comments');
                gallery.unset('liked');
                gallery.unset('reposted');
            }
            if (show_report_stats) {
                gallery.set('report_count', 0);
                gallery.set('report_reasons', []);
            } else {
                
                gallery.unset('report_count');
                gallery.unset('report_reasons');
            }
            if (show_assignment) {
                gallery.set('assignments', []);
            } else {
                gallery.unset('assignments');
            }
        }

        return Promise
            .all([
                // Owners promise
                new Promise((yes, no) => {
                    if (!show_owner) return yes();

                    User.knex.from('users')
                        .select('*')
                        .whereIn('id', references.owners.ids)
                        .where(qb => User.QUERIES.ACTIVE(qb))
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _owner = User.forge(row);
                                references.owners.map[row.id].forEach(gallery => gallery.relations.owner = _owner);
                                references.owners.build.push(_owner);
                            }
                            UserController
                                .build(user_model, references.owners.build, Object.assign({
                                    filter: User.FILTERS.PUBLIC,
                                    show_social_stats: true,
                                    show_submission_stats: true,
                                    show_blocked: true,
                                    show_disabled: true,
                                    trx
                                }, build_owner))
                                .then(yes)
                                .catch(no);
                        }).catch(no);
                }),
                // Curators promise
                new Promise((yes, no) => {
                    if (!show_curator) return yes();

                    User.knex
                        .from('users')
                        .select('*')
                        .whereIn('id', references.curators.ids)
                        .where(qb => User.QUERIES.ACTIVE(qb))
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _curator = User.forge(row);
                                references.curators.map[row.id].forEach(g => g.relations.curator = _curator);
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
                // Posts promise
                new Promise((yes, no) => {
                    if (!show_posts) return yes();
                    Post.knex
                        .from('posts')
                        .select(...Post.GEO_FILTERS.PUBLIC, 'gallery_id')
                        .innerJoin('gallery_posts', 'post_id', 'posts.id')
                        .whereIn('gallery_posts.gallery_id', references.posts.ids)
                        .where(qb => Post.QUERIES.VISIBLE(qb, { user: user_model, rating }))
                        .orderBy('gallery_posts.position', 'asc')
                        .transacting(trx)
                        .then((rows = []) => {
                            for (let row of rows) {
                                let _post = Post.forge(row);
                                references.galleries.map[row.gallery_id].relations.posts.push(_post);
                                references.posts.build.push(_post);
                            }

                            PostController
                                .build(references.posts.build, Object.assign({
                                    user: user_model,

                                    rating,
                                    show_parent: true,
                                    show_owner: true,
                                    show_purchased: true,
                                    trx
                                }, build_posts))
                                .then(yes)
                                .catch(no);
                        }).catch(no);
                }),
                // Stories promise
                new Promise((yes, no) => {
                    if (!show_stories) return yes();

                    Story.knex
                        .from('stories')
                        .select('stories.*', 'gallery_id')
                        .innerJoin('story_galleries', 'story_id', 'stories.id')
                        .whereIn('story_galleries.gallery_id', references.stories.ids)
                        .orderBy('updated_at', 'desc')
                        .transacting(trx)
                        .then((rows = []) => {
                            for (let row of rows) {
                                let _story = Story.forge(row);
                                references.galleries.map[row.gallery_id].relations.stories.push(_story);
                                references.stories.build.push(_story);
                            }
                            
                            StoryController
                                .build(user_model, references.stories.build, Object.assign({
                                    filter: Story.FILTERS.PREVIEW,
                                    trx
                                }, build_stories))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                }),
                // Articles promise
                new Promise((yes, no) => {
                    if (!show_articles) return yes();

                    Article.knex
                        .from('articles')
                        .select(...Article.FILTERS.PUBLIC.map(t => `articles.${t}`), 'gallery_id')
                        .innerJoin('gallery_articles', 'article_id', 'articles.id')
                        .whereIn('gallery_articles.gallery_id', references.articles.ids)
                        .orderBy('gallery_articles.created_at', 'desc')
                        .transacting(trx)
                        .then((rows = []) => {
                            for (let row of rows) {
                                let _article = Article.forge(row);
                                references.galleries.map[row.gallery_id].relations.articles.push(_article);
                                references.articles.build.push(_article);
                            }

                            ArticleController
                                .build(user_model, references.articles.build, Object.assign({
                                    filter: Article.FILTERS.PUBLIC,
                                    trx
                                }, build_articles))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                }),
                // Like stats fields
                new Promise((yes, no) => {
                    if (!show_stats) return yes();

                    Gallery.knex
                        .raw(`
                            SELECT
                                gallery_id,
                                COUNT(*) AS like_count,
                                ARRAY_AGG(user_id) AS user_ids
                            FROM gallery_likes
                            WHERE gallery_id = ANY(?)
                            GROUP BY gallery_id;
                        `, [references.galleries.ids])
                        .transacting(trx)
                        .then(({ rows = [] } = {}) => {
                            for (let row of rows) {
                                let g = references.galleries.map[row.gallery_id];
                                g.set('likes', parseInt(row.like_count, 0));

                                if (user_model) {
                                    g.set('liked', row.user_ids.includes(user_model.get('id')));
                                }
                            }
                            yes();
                        })
                        .catch(no);
                }),
                // Repost stats fields
                new Promise((yes, no) => {
                    if (!show_stats) return yes();

                    Gallery.knex
                        .raw(`
                            SELECT
                                gallery_id,
                                COUNT(*) AS repost_count,
                                ARRAY_AGG(user_id) AS user_ids
                            FROM gallery_reposts
                            WHERE gallery_id = ANY(?)
                            GROUP BY gallery_id;
                        `, [references.galleries.ids])
                        .transacting(trx)
                        .then(({ rows = [] } = {}) => {
                            for (let row of rows) {
                                let g = references.galleries.map[row.gallery_id];
                                g.set('reposts', parseInt(row.repost_count, 0));

                                if (user_model) {
                                    g.set('reposted', row.user_ids.includes(user_model.get('id')));
                                }
                            }
                            yes();
                        })
                        .catch(no);
                }),
                // Comments stats fields
                new Promise((yes, no) => {
                    if (!show_stats) return yes();

                    let qb = Gallery.knex
                        .select(
                            'gallery_id',
                            Gallery.knex.raw('COUNT(*) AS comment_count')
                        )
                        .from('gallery_comments')
                        .innerJoin('comments', 'gallery_comments.comment_id', 'comments.id')
                        .whereIn('gallery_id', references.galleries.ids)
                        .groupBy('gallery_id');

                    User.QUERIES.BLOCKING_FILTER(qb, { user: user_model, column: 'comments.user_id' });

                    qb
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                references.galleries.map[row.gallery_id].set('comments', parseInt(row.comment_count, 0));
                            }
                            yes();
                        })
                        .catch(no);
                }),
                // Post stats fields
                new Promise((yes, no) => {
                    if (!show_stats) return yes();

                    let qb = Post.knex
                        .from('posts')
                        .transacting(trx)
                        .select(
                            'gallery_id',
                            Post.knex.raw('SUM(CASE WHEN video IS NULL THEN 1 ELSE 0 END) AS photo_count'),
                            Post.knex.raw('SUM(CASE WHEN video IS NOT NULL THEN 1 ELSE 0 END) AS video_count')
                        )
                        .innerJoin('gallery_posts', function() {
                            this.on(Post.knex.raw('gallery_posts.post_id = posts.id AND gallery_id = ANY(?)', [references.galleries.ids]));
                        })
                        .groupBy('gallery_id');
                    Post.QUERIES.VISIBLE(qb, { user: user_model, rating });

                    qb.then(rows => {
                        for (let row of rows) {
                            let g = references.galleries.map[row.gallery_id];
                            g.set('photo_count', parseInt(row.photo_count, 0));
                            g.set('video_count', parseInt(row.video_count, 0));
                        }
                        yes();
                    }).catch(no);
                }),
                // Report stats
                new Promise((yes, no) => {
                    if (!show_report_stats) return yes();

                    let qb = GalleryReport.knex
                        .from('gallery_reports')
                        .innerJoin('reports', 'gallery_reports.report_id', 'reports.id')
                        .select(
                            'gallery_reports.gallery_id',
                            GalleryReport.knex.raw('COUNT(*) AS report_count'),
                            GalleryReport.knex.raw('array_agg(DISTINCT reports.reason) AS reasons')
                        )
                        .whereIn('gallery_reports.gallery_id', references.galleries.ids)
                        .groupBy('gallery_reports.gallery_id')
                        .transacting(trx);
                    Report.QUERIES.VISIBLE(qb);
                    qb.then(rows => {
                        for (let row of rows) {
                            let g = references.galleries.map[row.gallery_id];
                            g.set('report_count', parseInt(row.report_count, 0));
                            g.set('report_reasons', row.reasons);
                        }
                        yes();
                    }).catch(no);
                }),
                // Assignment Promise
                new Promise((yes, no) => {
                    if (!show_assignment) return yes();

                    Gallery.knex
                        .from('gallery_posts')
                        .distinct(
                            'gallery_posts.gallery_id',
                            ...Assignment.GEO_FILTERS.PUBLIC
                        )
                        .innerJoin('posts', 'gallery_posts.post_id', 'posts.id')
                        .innerJoin('assignments', 'posts.assignment_id', 'assignments.id')
                        .whereIn('gallery_posts.gallery_id', references.galleries.ids)
                        .transacting(trx)
                        .then((rows = []) => {
                            for (let row of rows) {
                                let _assignment = Assignment.forge(row);
                                references.galleries.map[row.gallery_id].get('assignments').push(_assignment);
                                references.assignments.build.push(_assignment);
                            }

                            AssignmentController
                                .build(user_model, references.assignments.build, Object.assign({
                                    filter: Assignment.FILTERS.PREVIEW,
                                    trx
                                }, build_assignments))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                })
            ])
            .then(() => Promise.resolve(isArr ? galleries : galleries[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    delete(user_model, gallery_id, trx) {
        let query = { id: gallery_id };
        if (!user_model.can('admin', 'delete', 'gallery')) {
            query.owner_id = user_model.get('id');
        }

        return Gallery
            .where(query)
            .fetch({
                require: true,
                transacting: trx,
                withRelated: {
                    posts: qb => {
                        qb.select(...Post.GEO_FILTERS.PUBLIC);
                        qb.joinRaw(`INNER JOIN LATERAL (
                                SELECT
                                    COUNT(*) AS count
                                FROM purchases
                                WHERE purchases.post_id = posts.id
                                LIMIT 1
                            ) purchase_count ON TRUE
                        `);
                        qb.joinRaw(`INNER JOIN LATERAL (
                                SELECT
                                    COUNT(*) AS count
                                FROM gallery_posts
                                WHERE gallery_posts.post_id = posts.id
                                GROUP BY gallery_posts.post_id
                                LIMIT 1
                            ) gallery_count ON TRUE`
                        );
                        qb.where('posts.parent_id', gallery_id);
                        qb.where('gallery_count.count', 1);
                        qb.where('purchase_count.count', 0);
                    }
                }
            })
            .catch(Gallery.NotFoundError, () =>
                Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Invalid gallery')
                )
            )
            .then(gallery_model =>
                Promise
                    .each(gallery_model.related('posts').models, post => {
                        if (parseInt(post.get('purchases'), 10) > 0) {
                            return post.save({
                                archived: true
                            }, {
                                patch: true,
                                method: 'update',
                                transacting: trx
                            });
                        } else {
                            return post.destroy({ transacting: trx });
                        }
                    })
                    .then(() => gallery_model.destroy({ transacting: trx }))
            )
            .then(() => Promise.resolve({ success: 'ok' }))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Creates new gallery based on given data and
     * generates presigned urls for posts.
     * 
     * NOTE: Each post should have a fileSize and a chunkSize param.
     *       If missing, a single URL will be generated for that post to upload to.
     *       Images will usually fit this case.
     *
     * NOTE: Because create is mainly intended to be used by mobile platforms
     *       and not the web platform, post params are limited. Use importGallery
     *       to pass any params to the gallery / posts.
     *
     * @param user_model
     * @param data.posts[n].address
     * @param data.posts[n].lat
     * @param data.posts[n].lng
     * @param data.posts[n].contentType (default= 'image/jpg')
     * @param data.posts[n].fileSize
     * @param data.posts[n].chunkSize
     * @param options
     * 
     * @returns { gallery, posts[] }
     */
    create(gallery_type = 'import', {
        editorial_caption,
        highlighted_at,
        caption,
        address,
        rating = Gallery.RATING.UNRATED,
        tags = [],
        posts_add = [],
        posts_new = [],
        stories_add = [],
        stories_new = [],
        articles_add = [],
        articles_new = [],
        assignment_id,
        outlet_id
    } = {}, { user, trx } = {}) {
        if (user && user.isSuspended()) {
            return Promise.reject(ferror(ferror.FORBIDDEN).msg('User suspended'));
        }

        let is_admin = user.can('admin', 'create', 'gallery');

        if (!is_admin && (highlighted_at !== undefined || rating !== Gallery.RATING.UNRATED || posts_add.length || stories_add.length || stories_new.length || articles_add.length || articles_new.length)) {
            return Promise.reject(ferror(ferror.FORBIDDEN));
        } else if (posts_add.length + posts_new.length > Gallery.MAX_POSTS_LENGTH) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .param(['posts_new', 'posts_add'])
                    .msg('Galleries can have a maximum of 8 posts')
            );
        } else if (!is_admin && posts_add.length + posts_new.length === 0) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .param(['posts_new', 'posts_add'])
                    .msg('Galleries require at least 1 post')
            );
        }

        let gallery = new Gallery({
            editorial_caption,
            highlighted_at,
            caption,
            address,
            tags,
            rating,
            owner_id: gallery_type === 'submission' ? user.get('id') : null,
            curator_id: gallery_type === 'import' || gallery_type === 'curated' ? user.get('id') : null,
            importer_id: gallery_type === 'import' ? user.get('id') : null
        });

        // TODO This should be done by the requestor by putting outlet_id and assignment_id into the posts_new hashes 
        if ((assignment_id || outlet_id) && posts_new.length > 0) {
            posts_new.forEach(p => {
                p.outlet_id = outlet_id;
                p.assignment_id = assignment_id;
            });
        }

        return gallery
            .save(null, { transacting: trx })
            .then(() => // Process the relations of the gallery
                Promise
                    .all([
                        PostController.makeBulk({ type: gallery_type, gallery_model: gallery, posts_new }, { user, trx }),
                        gallery.stories().attach(stories_add, { transacting: trx }),
                        gallery.articles().attach(articles_add, { transacting: trx }),
                        gallery.posts().attach(posts_add, { transacting: trx }),
                        ArticleController.makeBulk(user, gallery, articles_new, trx),
                        StoryController.makeBulk(user, gallery, stories_new, trx)
                    ])
                    .then(([post_urls] = []) => { // Handle gallery posts relationship with assignments
                        gallery.set('posts_new', post_urls);
                        return gallery;
                    })
            )
            .then(gallery => {
                // Auto Verify galleries after 15 minutes
                NotificationController.Mediums.Delayed
                    .send({
                        type: 'gallery-auto-verify',
                        key: gallery.get('id'),
                        delay: config.APPLICATION.DELAYS.AUTO_VERIFY,
                        fields: {
                            gallery_id: gallery.get('id')
                        }
                    })
                    .catch(reporter.report);

                return gallery
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    submit(params = {}, { user, trx } = {}) {
        return this.create('submission', params, { user, trx });
    }

    /**
     * Imports a gallery from social media
     * 
     * @param {Model} user_model
     * @param options   
     * @param {String} options.caption
     * @param {String[]} options.tags
     * @param {String} options.external_id     source's ID for this content
     * @param {String} options.external_source          facebook or twitter
     * @param {Object[]} options.posts           Posts to attach to this gallery, to be uploaded locally
     * @param {Transaction} _trx
     */
    import(params = {}, { user, outlet, trx } = {}) {
        let { // Import params
            external_id,
            external_source
        } = params;
        let has_imports = !!external_id;
        let gallery_type = 'import';
        if (params.posts_add) {
            gallery_type = 'curated';
        }

        return this
            .create(gallery_type, params, { user, outlet, trx })
            .then(gallery => { // Fetch media from social link
                if (!has_imports) return gallery;

                if (external_source === 'twitter') {
                    return SocialController.Twitter
                        .importPosts(user, gallery, external_id, trx)
                        .then(imports => {
                            if (!imports.length) {
                                return Promise.reject(
                                    ferror(ferror.FAILED_REQUEST)
                                        .msg('Tweet does not contain any media.')
                                );
                            } else {
                                return gallery
                                    .posts()
                                    .attach(imports.map(i => i.get('id')), { transacting: trx });
                            }
                        })
                        .then(() => gallery);
                } else {
                    return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .param('external_source')
                            .value(external_source || null)
                            .msg('Invalid source of media. Supported sources: "twitter"')
                    );
                }
            })
            .then(gallery => { // Update the gallery
                if (has_imports) {
                    let posts_new = gallery.get('posts_new');
                    return gallery
                        .save(null, { method: 'update', transacting: trx })
                        .then(gallery => gallery.set('posts_new', posts_new));
                } else {
                    return gallery;
                }
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Get gallery or array of galleries.
     * Returns gallery object if single ID, gallery array if array of IDs
     *
     * @param ids
     * @param user_model
     */
    get(ids = [], { user, outlet, trx } = {}) {
        let isArr = _.isArray(ids);
        if (!isArr) {
            ids = [ids];
        }

        return Gallery
            .query(qb => {
                qb.select(Gallery.GEO_FILTERS.PUBLIC);
                qb.whereIn('id', ids);
            })
            .fetchAll({ require: true, transacting: trx })
            .then(gs => {
                if (isArr) {
                    return Promise.resolve(gs.models);
                } else if(gs.length) {
                    return Promise.resolve(gs.models[0]);
                } else {
                    return Promise.reject(ferror(ferror.NOT_FOUND));
                }
            })
            .catch(Gallery.Collection.EmptyError, err =>
                Promise.reject(
                    ferror(ferror.NOT_FOUND)
                        .msg('Gallery(ies) not found')
                )
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    posts(gallery_id, { rating, sortBy = 'id', direction = 'desc', limit = 10, last, page } = {}, { user, outlet, trx } = {}) {
        return Gallery
            .forge({ id: gallery_id })
            .fetch({
                require: true,
                transacting: trx,
                withRelated: {
                    posts: qb => {
                        qb.select(Post.GEO_FILTERS.PUBLIC);
                        Post.QUERIES.VISIBLE(qb, { user, outlet, rating });
                        Post.paginate(qb, { sortBy, direction, limit, page, last });
                    }
                }
            })
            .then(g => g.related('posts').models)
            .catch(Gallery.NotFoundError, err =>
                Promise.reject(
                    ferror(ferror.NOT_FOUND)
                        .msg('Gallery not found')
                )
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    // TODO Maybe put this in a build function?
    /**
     * Returns a list of posts that have been purchased from the gallery, with info on the outlets that have purchased it
     * @param user_model The logged in user
     * @param gallery_id The gallery to query for
     * @param trx The transaction that this request is running in (optional)
     */
    purchases(gallery_id, { user, trx } = {}) {
        return Gallery
            .forge( { id: gallery_id })
            .fetch({
                require: true,
                transacting: trx,
                withRelated: 'posts.purchases.outlet'
            })
            .then(gallery => {
                if (gallery.get('owner_id') != user.get('id') && !user.permissions.can('admin', 'get', 'purchase')) {
                    return Promise.reject(
                        ferror(ferror.FORBIDDEN)
                            .msg('You do not have permission to view purchases for this gallery')
                    );
                }

                let posts = [];
                for (let post of gallery.related('posts').models) {
                    let purchases = [];
                    for (let purchase of post.related('purchases').models) {
                        purchases.push({
                            id: purchase.get('id'),
                            outlet: {
                                id: purchase.related('outlet').get('id'),
                                title: purchase.related('outlet').get('title'),
                                avatar: purchase.related('outlet').get('avatar'),
                                object: 'outlet'
                            },
                            amount: parseInt(purchase.get('amount')) - parseInt(purchase.get('fee'))
                        });
                    }
                    if (purchases.length) {
                        delete post.relations.purchases;
                        post.set('purchases', purchases);
                        posts.push(post);
                    }
                }
                return Promise.resolve(posts);
            })
            .catch(Gallery.NotFoundError, err =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('Gallery not found'))
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Gets posts from highlighted galleries
     */
    highlights({ sortBy = 'highlighted_at', direction = 'desc', limit = 20, last, page } = {}, { user, outlet, trx } = {}) {
        return Gallery
            .query(qb => {
                qb.select(Gallery.GEO_FILTERS.PUBLIC);
                qb.where('galleries.highlighted_at', '<=', Gallery.knex.raw('CURRENT_TIMESTAMP'))
                Gallery.QUERIES.VISIBLE(qb, {
                    user, outlet,
                    post_options: {
                        status: Post.STATUS.COMPLETE
                    }
                });
                if (sortBy === 'updated_at') {
                    Gallery.paginate(qb, { sortBy, direction, limit, last, page, coalesce: 'created_at' });
                } else {
                    Gallery.paginate(qb, { sortBy, direction, limit, last, page });
                }

                qb.leftJoin('users', 'galleries.owner_id', 'users.id');
                User.QUERIES.ACTIVE(qb);
                User.QUERIES.BLOCKING_FILTER(qb, { user });
            })
            .fetchAll({ transacting: trx })
            .then(g => g.models)
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    list({ 
        rating = Gallery.RATING.VERIFIED,
        imported,
        created_before,
        created_after,
        updated_before,
        updated_after,
        highlighted_before,
        highlighted_after,
        geo,
        geo_where = 'intersects',
        radius = 0,
        sortBy = 'created_at',
        direction = 'desc',
        last,
        page,
        limit = 20
    } = {},
    {
        user,
        outlet,
        trx
    } = {}) {
        return Gallery
            .query(qb => {
                qb.select(Gallery.GEO_FILTERS.PUBLIC);
                Gallery.QUERIES.HAS_CONTENT(qb, {
                    user, outlet,
                    post_options: {
                        status: Post.STATUS.COMPLETE
                    }
                });

                if (rating !== undefined) {
                    if (_.isArray(rating)) {
                        qb.whereIn('galleries.rating', rating);
                    } else {
                        qb.where('galleries.rating', rating);
                    }

                    // If you are requesting unrated content, only return YOUR unrated content
                    if (
                        (!user || !user.can('admin', 'get', 'gallery'))
                        && (
                            rating === Post.RATING.UNRATED
                            || (_.isArray(rating) && rating.includes(Post.RATING.UNRATED))
                        )
                    ) {
                        qb.where(_qb => {
                            _qb.where('galleries.rating', '!=', Gallery.RATING.UNRATED);
                            if (user) _qb.orWhere('galleries.owner_id', user.get('id'));
                        });
                    }
                }

                qb.leftJoin('users', 'galleries.owner_id', 'users.id');
                User.QUERIES.ACTIVE(qb);
                User.QUERIES.BLOCKING_FILTER(qb, { user });

                if (created_after) {
                    qb.where('galleries.created_at', '>', created_after);
                }
                if (created_before) {
                    qb.where('galleries.created_at', '<', created_before);
                }
                if (updated_after) {
                    qb.where('galleries.updated_at', '>', updated_after);
                }
                if (updated_before) {
                    qb.where('galleries.updated_at', '<', updated_before);
                }
                if (highlighted_after) {
                    qb.where('galleries.highlighted_at', '>', highlighted_after);
                }
                if (highlighted_before) {
                    qb.where('galleries.highlighted_at', '<', highlighted_before);
                }

                if (imported) {
                    qb.whereNull('galleries.owner_id');
                } else if (imported === false) {
                    qb.whereNotNull('galleries.owner_id');
                }

                if (geo) {
                    Gallery.queryGeo(qb, { geoJson: geo, radius, where });
                }

                Gallery.paginate(qb, { sortBy, direction, limit, last, page });
            })
            .fetchAll({ transacting: trx })
            .then(coll => coll.models)
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    reports(user_model, gallery_id, { sortBy = 'id', direction = 'desc', last, page, limit = 20 } = {}, trx) {
        return Report
            .query(qb => {
                qb.innerJoin('gallery_reports', 'reports.id', 'gallery_reports.report_id');
                qb.where('gallery_reports.gallery_id', gallery_id);
                Report.QUERIES.VISIBLE(qb);
                Report.paginate(qb, { sortBy, direction, last, limit, page });
            })
            .fetchAll({ transacting: trx })
            .then(coll => Promise.resolve(coll.models))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    report(user_model, gallery_id, {reason, message} = {}, trx) {
        let gallery_model = Gallery.forge({ id: gallery_id });

        return gallery_model
            .fetch({
                require: true,
                transacting: trx
            })
            .catch(Gallery.NotFoundError, () => Promise.reject(ferror(ferror.NOT_FOUND).msg('Gallery not found')))
            .catch(err => Promise.reject(ferror.constraint(err)))
            .then(() => ReportController.make(user_model, reason, message, trx))
            .then(report_model =>
                report_model
                    .reported_gallery()
                    .attach(gallery_model, { transacting: trx })
                    .then(() => Promise.resolve(report_model))
            )
            .then(report_model => report_model.fetch({ transacting: trx }))
            .catch(err => Promise.reject(ferror.constraint(err)))
    }

    unreport(user_model, report_id, trx) {
        return new Promise((resolve, reject) => {
            Report
                .forge({ id: report_id })
                .destroy({ require: true, transacting: trx })
                .then(r => resolve({ success: 'ok' }))
                .catch(Report.NoRowsDeletedError, ferror(ferror.NOT_FOUND)
                    .msg('Report not found')
                    .param('report_id')
                    .value(report_id)
                    .trip(reject)
                )
                .catch(ferror.constraint(reject));
        });
    }

    reported(user_model, { reasons = ['spam', 'abuse', 'stolen', 'nsfw'], sortBy = 'created_at', direction = 'desc', limit = 20, last } = {}) {
        return new Promise((resolve, reject) => {

            let reported_galleries = Gallery.knex
                .select(
                    Gallery.knex.raw('gallery_reports.gallery_id AS gallery_id'),
                    Gallery.knex.raw('MAX(reports.created_at) AS created_at')
                )
                .from('gallery_reports')
                .innerJoin('reports', 'gallery_reports.report_id', 'reports.id')
                .whereIn('reports.reason', reasons)
                .groupBy('gallery_reports.gallery_id');
            Report.QUERIES.VISIBLE(reported_galleries, { user: user_model });

            let galleries = Gallery.knex
                .select(Gallery.GEO_FILTERS.PUBLIC)
                .from('reported_galleries')
                .innerJoin('galleries', 'reported_galleries.gallery_id', 'galleries.id');

            // Manual pagination, because we need to sort by report created at
            // TODO figure out a better way to do this
            if (last) {
                galleries.where('galleries.id', '!=', last);
                galleries.whereRaw(
                    `?? ${ direction == 'desc' ? '<' : '>' } (SELECT ?? FROM ?? WHERE gallery_id = ?)`,
                    [`reported_galleries.created_at`, 'created_at', 'reported_galleries', last]
                );
            }
            galleries.orderBy('reported_galleries.created_at', direction);
            if (limit) {
                galleries.limit(limit);
            }

            Gallery.knex
                .raw(`WITH "reported_galleries" AS (${reported_galleries}) ${galleries}`)
                .then(({ rows = [] }) => {
                    let gs = [];
                    for (let row of rows) {
                        gs.push(Gallery.forge(row));
                    }
                    return gs;
                })
                .then(resolve)
                .catch(ferror.trip(reject));
        });
    }

    skipReport(user_model, gallery_id, trx) {
        return new Promise((resolve, reject) => {
            Report.knex
                .raw(`
                    UPDATE reports
                    SET status = -1
                    WHERE reports.status = 0
                    AND reports.id IN (
                        SELECT report_id FROM gallery_reports WHERE gallery_id = ?
                    )
                `, [gallery_id])
                .transacting(trx)
                .then(() => resolve({ success: 'ok' }))
                .catch(ferror.constraint(reject));
        });
    }

    actReport(user_model, gallery_id, trx) {
        return new Promise((resolve, reject) => {
            Gallery
                .query(qb => {
                    qb.select(User.disambiguate(User.FILTERS.SAFE));
                    qb.innerJoin('users', 'users.id', 'galleries.owner_id');
                    qb.where('galleries.id', gallery_id);
                })
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
                                SELECT report_id FROM gallery_reports WHERE gallery_id = ?
                            )
                        `, [gallery_id])
                        .transacting(trx))
                .then(u => resolve({ success: 'ok' }))
                .catch(ferror.constraint(reject));
        })
    }

    /**
     * Search for galleries using fulltext search
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
     */
    search(
        user_model, 
        { 
            q,
            rating,
            created_before,
            created_after,
            updated_before,
            updated_after,
            tags,
            geo,
            radius = 0,
            count = true,
            geo_where = 'intersects',
            last,
            limit = 10,
            sortBy = 'created_at',
            direction = 'desc'
        } = {},
        trx
    ) {
        q = q && q.trim ? q.trim() : q;

        return Gallery
            .query(qb => {
                let inner_qb = Gallery.knex('galleries').select('galleries.*');
                let last_qb = Gallery.knex('galleries').select('*').where('id', last).limit(1);

                if (count) inner_qb.select(Gallery.knex.raw('COUNT(*) OVER() AS __result_count'));

                // FTS query if querystring provided
                if (q) {
                    inner_qb.from(Gallery.knex.raw('galleries, PLAINTO_OR_TSQUERY(?) AS "_fts_query"', [q]))
                    inner_qb.select(Gallery.knex.raw('TS_RANK("_fts", "_fts_query") AS "_fts_rank"'))
                    inner_qb.whereRaw('?? @@ ??', ['_fts', '_fts_query']);
                    // sortBy = '_fts_rank';

                    if (last) {
                        last_qb.select(Gallery.knex.raw('TS_RANK("_fts", PLAINTO_OR_TSQUERY(?)) AS "_fts_rank"', [q]));
                    }
                }

                // Query by timestamp, if provided
                if (created_before) {
                    inner_qb.where('created_at', '<', created_before);
                }
                if (created_after) {
                    inner_qb.where('created_at', '>', created_after);
                }
                if (updated_before) {
                    inner_qb.where('updated_at', '<', updated_before);
                }
                if (updated_after) {
                    inner_qb.where('updated_at', '>', updated_after);
                }
                if (geo) {
                    Gallery.queryGeo(inner_qb, { geoJson: geo, radius, where: geo_where });
                }
                if (tags) {
                    if (!_.isArray(tags)) tags = [tags];
                    inner_qb.whereRaw('"galleries"."tags" @> ?', [tags]);
                }
                if (_.isArray(rating)) {
                    inner_qb.whereIn('rating', rating.filter(n => !isNaN(n)));
                } else if (!isNaN(rating)) {
                    inner_qb.where('rating', rating);
                }

                Gallery.QUERIES.VISIBLE(inner_qb, {
                    user: user_model,
                    status: Post.STATUS.COMPLETE,
                    min_rating: _.isArray(rating) ? rating.reduce((a,b)=>a<b?a:b) : rating
                });

                let from_query = `(${inner_qb.toString()}) AS galleries`;

                if (last) {
                    qb.where(function() {
                        this.where('galleries.' + sortBy, direction === 'asc' ? '>' : '<', Gallery.knex.raw('last_gallery.' + sortBy))
                        this.orWhere(function() {
                            this.where('galleries.' + sortBy, Gallery.knex.raw('last_gallery.' + sortBy));
                            this.where('galleries.id', '<', Gallery.knex.raw('last_gallery.id'));
                        });
                    });
                    from_query += `, (${last_qb.toString()}) AS last_gallery`
                }

                qb.from(Gallery.knex.raw(from_query));
                qb.select(...Gallery.GEO_FILTERS.ALL);
                if (count) qb.select('__result_count');
                qb.orderBy('galleries.' + sortBy, direction);
                qb.orderBy('galleries.id', 'desc');

                qb.limit(limit);
            })
            .fetchAll({ transacting: trx })
            .then(gallery_collection => {
                let result = { results: gallery_collection.models };

                if (count) {
                    let _count = 0;
                    for (let gallery_model of gallery_collection.models) {
                        _count = parseInt(gallery_model.get('__result_count'), 10);
                        gallery_model.unset('__result_count');
                    }
                    result.count = _count;
                }

                return result;
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Update an existing gallery
     * NOTE —— is_nsfw is applies to gallery's posts via a pgsql trigger+procedure
     * @param  {[type]} user_model [description]
     * @param  {[type]} gallery_id [description]
     * @param  {Object} updates    [description]
     * @param  {[type]} trx        [description]
     * @return {[type]}            [description]
     */
    update(user_model, gallery_id, updates = {}, trx) {
        return new Promise((resolve, reject) => {
            const fieldsToUpdate = Object.keys(updates);
            let _is_nsfw = null, _was_verified = false;
            let _this = this;
            let gallery = Gallery.forge({ id: gallery_id });
            let {
                assignment_id,
                posts_update = [],
                posts_new = [],
                posts_add = [],
                posts_remove = [],
                articles_new = [],
                articles_add = [],
                articles_remove = [],
                stories_new = [],
                stories_add = [],
                stories_remove = [],
                rating
            } = updates;

            // Check rights
            if (!user_model || !user_model.can('admin', 'update', 'gallery')) {
                if (updates.rating !== undefined) return reject(ferror(ferror.FORBIDDEN).param('rating'));
                if (updates.highlighted_at !== undefined) return reject(ferror(ferror.FORBIDDEN).param('highlighted_at'));
                if (updates.editorial_caption !== undefined) return reject(ferror(ferror.FORBIDDEN).param('editorial_caption'));
                if (updates.is_nsfw !== undefined) return reject(ferror(ferror.FORBIDDEN).param('is_nsfw'));
                if (updates.owner_id !== undefined) return reject(ferror(ferror.FORBIDDEN).param('owner_id'));
            }

            if (updates.rating !== undefined) {
                updates.curator_id = user_model.get('id');
            }

            updates.updated_at = new Date();

            gallery
                .fetch({
                    columns: Gallery.GEO_FILTERS.ALL,
                    withRelated: ['owner', 'posts'],
                    require: true,
                    transacting: trx
                })
                .then(() => updateGallery())
                .catch(Gallery.NotFoundError, ferror(ferror.NOT_FOUND).trip(reject))
                .catch(ferror.constraint(reject));

            function updateGallery() {
                _is_nsfw = gallery.get('is_nsfw'); //is_nsfw will get updated on the `save` call, need to have original value

                if (fieldsToUpdate.includes('rating')
                    && gallery.get('rating') < Gallery.RATING.VERIFIED
                    && updates.rating >= Gallery.RATING.VERIFIED) {
                    _was_verified = true;
                    posts_update.forEach(p => {
                        p.verified = true;
                    });
                }

                if (fieldsToUpdate.includes('owner_id') && gallery.get('importer_id') == null) {
                    return reject(ferror(ferror.INVALID_REQUEST).param('owner_id').msg('Gallery is not imported, cannot change owner'));
                }

                Promise
                    .all([
                        PostController.makeBulkImports({ gallery_model: gallery, posts_new }, { user: user_model, trx }),
                        Gallery.COLUMNS.with(fieldsToUpdate).length ? 
                            gallery.save(updates, { patch: true, method: 'update', transacting: trx }) : 
                            Promise.resolve(),
                        gallery.posts().attach(posts_add, { transacting: trx }),
                        gallery.posts().detach(posts_remove, { transacting: trx }),
                        gallery.stories().attach(stories_add, { transacting: trx }),
                        gallery.stories().detach(stories_remove, { transacting: trx }),
                        gallery.articles().attach(articles_add, { transacting: trx }),
                        gallery.articles().detach(articles_remove, { transacting: trx }),
                        ArticleController.makeBulk(user_model, gallery, articles_new, trx),
                        StoryController.makeBulk(user_model, gallery, stories_new, trx)
                    ])
                    .then(finish)
                    .then(updateNSFW)
                    .then(updatePostRating)
                    .then(() => Promise.each(posts_update, p => PostController.update(user_model, p.id, p, trx)))
                    .then(() => {
                        // relations aren't getting reset after posts are added and removed, so
                        // this forces the build function to fetch those relations again.
                        delete gallery.relations.posts;
                        delete gallery.relations.owner;
                        return resolve(gallery)
                    })
                    .catch(ferror.constraint(reject));
            }

            function finish([posts_new] = []){
                if (gallery.has('owner_id') && _was_verified) {
                    notifyOfVerification();
                }

                return gallery.set('posts_new', posts_new);
            }

            function updateNSFW() {
                if(fieldsToUpdate.includes('is_nsfw') && updates['is_nsfw'] !== _is_nsfw) {
                    return _this.setNSFW(user_model, gallery.get('id'), updates['is_nsfw'], trx);
                } else {
                    return Promise.resolve();
                }
            }

            function updatePostRating() {
                if (fieldsToUpdate.includes('rating') || fieldsToUpdate.includes('owner_id')) {
                    let post_rating = updates.rating > 2 ? 2 : updates.rating;
                    return gallery.posts()
                        .fetch({ transacting: trx })
                        .then(posts_coll => posts_coll.models.filter(p => p.get('parent_id') == gallery_id))
                        .then(posts => Promise.each(posts, p => PostController.update(user_model, p.id, { rating: post_rating, owner_id: updates.owner_id }, trx)));
                }
            }

            function notifyOfVerification() {
                let posts = gallery.related('posts').models;
                let image = null;
                if (posts.length) image = posts[0].get('image');
                NotificationController
                    .notify({
                        recipients: {
                            users: gallery.related('owner')
                        },
                        type: 'user-dispatch-content-verified',
                        payload: {
                            fresco: {
                                title: 'Content Verified',
                                body: 'Your content has just been verified and is available for purchase by local and national news organizations across the U.S. We will notify you if your content is purchased!',
                                meta: {
                                    gallery_id: gallery.get('id'),
                                    image
                                }
                            },
                            push: {
                                title: 'Content Verified',
                                body: 'Your content has just been verified and is available for purchase by local and national news organizations across the U.S. We will notify you if your content is purchased!',
                                data: {
                                    gallery_id: hashids.encode(gallery.get('id')),
                                    image
                                }
                            }
                        }
                    })
                    .catch(reporter.report)
            }
        });
    }

    /**
     * Sets the `is_nsfw` attribute on a gallery, the gallery's posts 
     * and the other galleries those posts are a part of.
     */
    setNSFW(user_model, gallery_id, is_nsfw = true, trx) {
        let gallery_model = Gallery.forge({ id: gallery_id })
        
        return gallery_model
            .fetch({
                columns: Gallery.GEO_FILTERS.PUBLIC,
                require: true,
                withRelated: [
                    'posts',
                    'posts.galleries',
                    'posts.galleries.posts'
                ],
                transacting: trx
            })
            .catch(Gallery.NotFoundError, err => Promise.reject(ferror(ferror.NOT_FOUND).msg('Gallery not found')))
            .catch(err => Promise.reject(ferror.constraint(err)))
            .then(() =>
                Promise.each(gallery_model.related('posts').models, processPost)
            )
            .then(() => ({ result: 'ok' }))

        function processPost(post_model) {
            return post_model
                .save({ is_nsfw }, { patch: true, transacting: trx })
                .catch(err => Promise.reject(ferror.constraint(err)))
                .then(() => Promise.each(post_model.related('galleries').models, g => processGallery(g, post_model)))
        }

        function processGallery(gallery_model, post_model) {
            let _nsfw = gallery_model.related('posts').some(p =>
                p.get('id') === post_model.get('id')
                    ? post_model.get('is_nsfw')
                    : p.get('is_nsfw')
            )
            if (_nsfw === gallery_model.get('is_nsfw')) return Promise.resolve()

            return gallery_model
                .save({ is_nsfw }, { patch: true, transacting: trx })
                .catch(err => Promise.reject(ferror.constraint(err)))
        }
    }
}

module.exports = new GalleryController;
module.exports.Social = require('./Social');

// Controller definitions go here to avoid circular relationships
const ArticleController = require('../Article');
const AssignmentController = require('../Assignment');
const CommentController = require('../Comment');
const NotificationController = require('../Notification');
const PostController = require('../Post');
const ReportController = require('../Report');
const SubmissionsController = require('../Submission');
const SocialController = require('../Social');
const StoryController = require('../Story');
const UserController = require('../User');