'use strict';

const _ = require('lodash');
const Promise = require('bluebird');

const ferror = require('../lib/frescoerror');
const knex = require('../lib/bookshelf').knex;

const Article = require('../models/article');
const Gallery = require('../models/gallery');
const Post = require('../models/post');
const Story = require('../models/story');
const Comment = require('../models/comment');
const StoryGalleries = require('../models/story_galleries');
const StoryLike = require('../models/story_like');
const StoryRepost = require('../models/story_repost');
const User = require('../models/user');

class StoryController {
    
    /**
     * Attaches stats and social fields to story model(s)
     * 
     * @param stories
     * @param user_model
     */
    build(user_model, stories, {
        filter = Story.FILTERS.PUBLIC,
        keep_fields = [],
        rating,
        show_curator = false,
        show_articles = false,
        show_thumbs = false,
        show_stats = false,

        build_curator = {},
        build_articles = {},
        build_thumbs = {},

        trx
    } = {}) {
        if (!stories) return Promise.resolve();

        let isArr = true;
        if(!_.isArray(stories)) {
            isArr = false;
            stories = [stories];
        }
        if (stories.length === 0) return Promise.resolve(stories);

        // map: Hashmap, hash being the related id, and value being an array of gallery models that share that relationship
        // ids: Array of all gallery ids that need this relationship resolved
        // build: Array of models to call the respective Controller#build function on, after fetching all relations
        let references = {
            stories: { map: {}, ids: [] },
            curators: { build: [], map: {}, ids: [] },
            articles: { build: [], ids: [] },
            thumbs: { build: [], ids: [] }
        };

        for (let story of stories) {
            let _story_id = story.get('id');
            let _curator_id = story.get('curator_id');

            story.columns(filter.concat(keep_fields));
            story.trigger('fetched', story);

            references.stories.ids.push(_story_id);
            references.stories.map[_story_id] = story;

            // NOTE defauls are set below because if stories have no results
            // in the corresponding query, they will not be included in the
            // query results

            if (show_curator) {
                if (story.relations.curator) {
                    references.curators.build.push(story.relations.curator);
                } else {
                    story.relations.curator = User.nullable();

                    if (_curator_id) {
                        if (!references.curators.map[_curator_id]) {
                            references.curators.map[_curator_id] = [story];
                            references.curators.ids.push(_curator_id);
                        } else {
                            references.curators.map[_curator_id].push(story);
                        }
                    }
                }
            } else {
                delete story.relations.curator;
            }
            if (show_thumbs) {
                // Make a default empty array for galleries without posts
                if (story.relations.thumbnails) {
                    references.thumbs.build = references.thumbs.build.concat(story.relations.thumbnails.models);
                } else {
                    story.relations.thumbnails = Post.Collection.forge();
                    references.thumbs.ids.push(_story_id);
                }
            } else {
                delete story.relations.thumbnails;
            }
            if (show_articles) {
                // Make a default empty array for galleries without articles
                if (story.relations.articles) {
                    story.relations.articles = story.relations.articles.slice(0, 3);
                    references.articles.build = references.articles.build.concat(story.relations.articles.models);
                } else {
                    story.relations.articles = Article.Collection.forge();
                    references.articles.ids.push(_story_id);
                }
            } else {
                delete story.relations.articles;
            }
            if (show_stats) {
                // Set default stats
                story.set('gallery_count', 0);
                story.set('likes', 0);
                story.set('reposts', 0);
                story.set('comments', 0);
                if (user_model) {
                    story.set('liked', false);
                    story.set('reposted', false);
                }
            } else {
                story.unset('gallery_count');
                story.unset('likes');
                story.unset('reposts');
                story.unset('comments');
                story.unset('liked');
                story.unset('reposted');
            }
        }

        return Promise
            .all([
                // Posts promise
                new Promise((yes, no) => {
                    if (!show_thumbs) return yes();

                    let qb = Post.knex
                        .from('posts')
                        .select(...Post.FILTERS.THUMBNAIL, Post.knex.raw('posts.created_at AS created_at'), 'story_id', Post.knex.raw('ROW_NUMBER() OVER (PARTITION BY story_id ORDER BY posts.created_at DESC) AS _rownum'))
                        .innerJoin('gallery_posts', 'gallery_posts.post_id', 'posts.id')
                        .innerJoin('story_galleries', 'story_galleries.gallery_id', 'gallery_posts.gallery_id')
                        .whereIn('story_galleries.story_id', references.thumbs.ids)
                        .where(qb => Post.QUERIES.VISIBLE(qb, { user: user_model, rating }));

                    Post.knex
                        .raw(`SELECT * FROM (${qb.toString()}) tmp WHERE _rownum <= 8`)
                        .transacting(trx)
                        .then(({ rows = [] } = {}) => {
                            for (let row of rows) {
                                let _thumb = Post.forge(row);
                                references.stories.map[row.story_id].relations.thumbnails.push(_thumb);
                                references.thumbs.build.push(_thumb);
                            }

                            PostController
                                .build(references.thumbs.build, Object.assign({
                                    user: user_model,
                                    
                                    filter: Post.FILTERS.THUMBNAIL,
                                    rating,
                                    trx
                                }, build_thumbs))
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
                                references.curators.map[row.id].forEach(story => story.relations.curator = _curator);
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
                // Articles promise
                new Promise((yes, no) => {
                    if (!show_articles) return yes();

                    Article.knex
                        .from('articles')
                        .select(...Article.FILTERS.PUBLIC.map(f => `articles.${f}`), 'story_id')
                        .innerJoin('story_articles', 'article_id', 'articles.id')
                        .whereIn('story_articles.story_id', references.articles.ids)
                        .orderBy('story_articles.created_at', 'desc')
                        .then((rows = []) => {
                            for (let row of rows) {
                                let _article = Article.forge(row);
                                references.stories.map[row.story_id].relations.articles.push(_article);
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

                    Story.knex
                        .raw(`
                            SELECT
                                story_id,
                                COUNT(*) AS like_count,
                                ARRAY_AGG(user_id) AS user_ids
                            FROM story_likes
                            WHERE story_id = ANY(?)
                            GROUP BY story_id;
                        `, [references.stories.ids])
                        .transacting(trx)
                        .then(({ rows = [] } = {}) => {
                            for (let row of rows) {
                                let s = references.stories.map[row.story_id];
                                s.set('likes', parseInt(row.like_count, 0));

                                if (user_model) {
                                    s.set('liked', row.user_ids.includes(user_model.get('id')));
                                }
                            }
                            yes();
                        })
                        .catch(no);
                }),
                // Repost stats fields
                new Promise((yes, no) => {
                    if (!show_stats) return yes();

                    Story.knex
                        .raw(`
                            SELECT
                                story_id,
                                COUNT(*) AS repost_count,
                                ARRAY_AGG(user_id) AS user_ids
                            FROM story_reposts
                            WHERE story_id = ANY(?)
                            GROUP BY story_id;
                        `, [references.stories.ids])
                        .transacting(trx)
                        .then(({ rows = [] } = {}) => {
                            for (let row of rows) {
                                let s = references.stories.map[row.story_id];
                                s.set('reposts', parseInt(row.repost_count, 0));

                                if (user_model) {
                                    s.set('reposted', row.user_ids.includes(user_model.get('id')));
                                }
                            }
                            yes();
                        })
                        .catch(no);
                }),
                // Comments stats fields
                new Promise((yes, no) => {
                    if (!show_stats) return yes();

                    Story.knex
                        .raw(`
                            SELECT
                                story_id,
                                COUNT(*) AS comment_count
                            FROM story_comments
                            WHERE story_id = ANY(?)
                            GROUP BY story_id;
                        `, [references.stories.ids])
                        .transacting(trx)
                        .then(({ rows = [] } = {}) => {
                            for (let row of rows) {
                                references.stories.map[row.story_id].set('comments', parseInt(row.comment_count, 0));
                            }
                            yes();
                        })
                        .catch(no);
                }),
                // Gallery stats fields
                new Promise((yes, no) => {
                    if (!show_stats) return yes();

                    let qb = Post.knex
                        .from('galleries')
                        .select(
                            'story_id',
                            Post.knex.raw('COUNT(*) AS gallery_count')
                        )
                        .innerJoin('story_galleries', function() {
                            this.on(Post.knex.raw('story_galleries.gallery_id = galleries.id AND story_id = ANY(?)', [references.stories.ids]));
                        })
                        .groupBy('story_id')
                        .where(qb => Gallery.QUERIES.VISIBLE(qb, {
                            user: user_model,
                            post_options: {
                                status: Post.STATUS.COMPLETE,
                                min_rating: rating
                            }
                        }))
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                references.stories.map[row.story_id].set('gallery_count', parseInt(row.gallery_count, 0));
                            }
                            yes();
                        })
                        .catch(no);
                }),
                // Post stats fields
                new Promise((yes, no) => {
                    if (!show_stats) return yes();

                    let qb = Story.knex
                        .from('story_galleries')
                        .select(
                            'story_id',
                            Post.knex.raw('SUM(CASE WHEN video IS NULL THEN 1 ELSE 0 END) AS photo_count'),
                            Post.knex.raw('SUM(CASE WHEN video IS NOT NULL THEN 1 ELSE 0 END) AS video_count')
                        )
                        .innerJoin('gallery_posts', 'gallery_posts.gallery_id', 'story_galleries.gallery_id')
                        .innerJoin('posts', 'posts.id', 'gallery_posts.post_id')
                        .whereIn('story_galleries.story_id', references.stories.ids)
                        .groupBy('story_id')
                        .where(qb => Post.QUERIES.VISIBLE(qb, { user: user_model, rating }))
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let s = references.stories.map[row.story_id];
                                s.set('photo_count', parseInt(row.photo_count, 0));
                                s.set('video_count', parseInt(row.video_count, 0));
                            }
                            yes();
                        }).catch(no);
                })
            ])
            .then(() => Promise.resolve(isArr ? stories : stories[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Creates
     *
     * @param user_model {Model} Authed user
     * @param params
     * @param params.title
     * @param params.caption
     * @param trx {knex.Transaction} optional transaction parameter
     */
    create(user_model, params, trx) {
        return new Promise((resolve, reject) => {
            Story
                .forge(params)
                .save(null, { transacting: trx })
                .then(s => s.fetch())
                .then(resolve)
                .catch(ferror.constraint(reject));
        });
    }

    /**
     * Get story
     * @param user_model
     * @param ids
     */
    get(user_model, ids = []) {
        return new Promise((resolve, reject) => {
            let isArr = true;
            if (!_.isArray(ids)) {
                isArr = false;
                ids = [ids];
            }

            Story
                .query(qb => {
                    qb.select(Story.GEO_FILTERS.PUBLIC);
                    if (isArr) {
                        qb.whereIn('id', ids);
                    } else {
                        qb.where('id', ids[0]);
                        qb.limit(1);
                    }
                })
                .fetchAll({ require: true })
                .then(sc => resolve(isArr ? sc.models : sc.models[0]))
                .catch(Story.Collection.EmptyError, ferror(ferror.NOT_FOUND).msg('Story(ies) not found').trip(reject))
                .catch(ferror.constraint(reject));
        });
    }

    galleries(user_model, story_id, { rating, sortBy = 'id', direction = 'desc', last, page, limit = 10 } = {}) {
        return new Promise((resolve, reject) => {
            Story
                .forge({ id: story_id })
                .fetch({
                    require: true,
                    withRelated: {
                        galleries: qb => {
                            qb.select(Gallery.GEO_FILTERS.PUBLIC);
                            Gallery.QUERIES.VISIBLE(qb, {
                                user: user_model,
                                post_options: {
                                    status: Post.STATUS.COMPLETE,
                                    min_rating: rating
                                }
                            });
                            Gallery.paginate(qb, { sortBy, direction, last, page, limit });

                            qb.leftJoin('users', 'galleries.owner_id', 'users.id');
                            User.QUERIES.ACTIVE(qb);
                        }
                    }
                })
                .then(coll => resolve(coll.related('galleries').models))
                .catch(Story.NotFoundError, ferror(ferror.NOT_FOUND).msg('Story not found').trip(reject))
                .catch(ferror.constraint(reject));
        })
    }

    /**
     * Make and attach stories created via `stories_new`
     * 
     * @param user_model {Model}
     * @param parent_model {Model}
     * @param stories_mew {object[]}
     * 
     * @returns {int[]}
     */
    makeBulk(user_model, parent_model, stories_new = [], trx) {
        return new Promise((resolve, reject) => {
            if (!stories_new.length) return resolve([]);
            
            let query = Story.knex('stories').insert(stories_new).returning('id');
            if (trx) query.transacting(trx);

            query.then(relate).catch(ferror.constraint(reject));

            function relate(story_ids) {
                parent_model
                    .stories()
                    .attach(story_ids, { transacting: trx })
                    .then(() => resolve(story_ids))
                    .catch(ferror.constraint(reject))
            }
        });
    }

    posts(user_model, story_id, { rating, sortBy = 'id', direction = 'desc', limit = 20, page, last } = {}) {
        return new Promise((resolve, reject) => {
            let story = Story.forge({ id: story_id });

            story
                .fetch({ require: true })
                .then(getPosts)
                .catch(Story.NotFoundError, ferror(ferror.NOT_FOUND).trip(reject))
                .catch(ferror.constraint(reject));

            function getPosts() {
                Post
                    .query(qb => {
                        qb.distinct('posts.id');
                        qb.select(Post.GEO_FILTERS.PUBLIC);
                        qb.innerJoin('story_galleries', 'story_galleries.story_id', story_id);
                        qb.innerJoin('gallery_posts', function() {
                            this.on(Post.knex.raw('gallery_posts.gallery_id = story_galleries.gallery_id AND gallery_posts.post_id = posts.id'));
                        });
                        Post.QUERIES.VISIBLE(qb, { user: user_model, rating });
                        Post.paginate(qb, { sortBy, direction, limit, page, last });
                    })
                    .fetchAll()
                    .then(coll => resolve(coll.models))
                    .catch(ferror.constraint(reject));
            }
        });
    }

    /**
     * delete story
     * @param user_model
     * @param story_id
     */
    delete(user_model, story_id) {
        return new Promise((resolve, reject) => {
            Story
                .forge({ id: story_id })
                .destroy({ require: true })
                .then(() => resolve({ success: 'ok' }))
                .catch(ferror(ferror.NOT_FOUND).trip(reject))
                .catch(ferror.trip(reject));
        });
    }

    /**
     * Lists recent stories
     *
     */
    recent(user_model, { created_before, created_after, updated_before, updated_after, geo, geo_where = 'intersects', radius = 0, sortBy = 'updated_at', direction = 'desc', last, page, limit = 20 }) {
        return new Promise((resolve, reject) => {
            let self = this;

            Story
                .query(qb => {
                    qb.select(Story.GEO_FILTERS.PUBLIC);
                    Story.paginate(qb, { sortBy, direction, limit, page, last });
                    
                    if (created_after) {
                        qb.where('created_at', '>', created_after);
                    }
                    if (created_before) {
                        qb.where('created_at', '<', created_after);
                    }
                    if (updated_after) {
                        qb.where('updated_at', '>', updated_after);
                    }
                    if (updated_before) {
                        qb.where('updated_at', '<', updated_after);
                    }

                    if (geo) {
                        Story.queryGeo(qb, { geoJson: geo, radius, where });
                    }

                    Story.QUERIES.VISIBLE(qb, { user: user_model });
                })
                .fetchAll()
                .then(coll => resolve(coll.models))
                .catch(ferror.constraint(reject));
        });
    }

    like(user_model, story_id) {
        return new Promise((resolve, reject) => {
            StoryLike
                .forge({
                    user_id: user_model.get('id'),
                    story_id: story_id
                })
                .save()
                .then(r => resolve({ success: 'ok'}))
                .catch(ferror.constraint(reject));
        });
    }
    
    unlike(user_model, story_id) {
        return new Promise((resolve, reject) => {
            StoryLike
                .where({
                    user_id: user_model.get('id'),
                    story_id: story_id
                })
                .destroy()
                .then(r => {
                    resolve({ success: 'ok'})
                })
                .catch(ferror(ferror.INVALID_REQUEST).msg('Unable to unlike story').trip(reject));
        });
    }

    comments(user_model, story_id, { sortBy = 'id', direction = 'desc', last, page, limit = 20 } = {}) {
        return new Promise((resolve, reject) => {
            Comment
                .query(qb => {
                    qb.where('story_id', story_id);
                    qb.innerJoin('story_comments', 'comments.id', 'story_comments.comment_id');
                    qb.where('story_comments.story_id', story_id);
                    Comment.paginate(qb, { sortBy, direction, last, page, limit });
                })
                .fetchAll()
                .then(coll => resolve(coll.models))
                .catch(ferror.constraint(reject));
        });
    }

    comment(user_model, story_id, comment, trx) {
        return new Promise((resolve, reject) => {
            CommentController
                .make(user_model, comment, trx)
                .then(attachStory)
                .catch(ferror.constraint(reject));
            
            function attachStory(comment) {
                comment
                    .stories()
                    .attach(story_id, { transacting: trx })
                    .then(() => resolve(comment))
                    .catch(ferror.constraint(reject));
            }
        })
    }

    uncomment(user_model, story_id, comment_id, trx) {
        return new Promise((resolve, reject) => {
            // TODO delete just be comment id...?
            StoryComment
                .forge({
                    story_id: story_id,
                    user_id: user_model.get('id'),
                    id: comment_id
                })
                .destroy({ require: true, transacting: trx })
                .then(c => resolve({ success: 'ok' }))
                .catch(Comment.NotFoundError, ferror(ferror.NOT_FOUND).trip(reject))
                .catch(ferror.constraint(reject));
        });
    }

    repost(user_model, story_id, trx) {
        if (user_model.isSuspended()) {
            return Promise.reject(ferror(ferror.FORBIDDEN).msg('User suspended'));
        }

        return Story
            .forge('id', story_id)
            .fetch({
                require: true,
                transacting: trx
            })
            .then(story_model =>
                new StoryRepost({
                        user_id: user_model.get('id'),
                        story_id: story_model.get('id')
                    })
                    .save(null, { method: 'insert', transacting: trx })
            )
            .then(() => Promise.resolve({ result: 'ok' }))
            .catch(Story.NotFoundError, () => Promise.reject(ferror(ferror.NOT_FOUND).msg('Story not found')))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    unrepost(user_model, story_id, trx) {
        return Story
            .forge({ id: story_id })
            .fetch({
                require: true,
                transacting: trx
            })
            .then(story_model =>
                StoryRepost
                    .where({
                        user_id: user_model.get('id'),
                        story_id: story_model.get('id')
                    })
                    .destroy({ transacting: trx })
            )
            .then(() => Promise.resolve({ result: 'ok' }))
            .catch(Story.NotFoundError, () => Promise.reject(ferror(ferror.NOT_FOUND).msg('Story not found')))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    update(user_model, story_id, updates = {}, _trx) {
        return new Promise((resolve, reject) => {
            if (!Object.keys(updates).length) return reject(ferror(ferror.INVALID_REQUEST).msg('No updates provided'));

            let _this = this;
            let story = Story.forge({ id: story_id });
            let {
                articles_new = [],
                articles_add = [],
                articles_remove = [],
                galleries_add = [],
                galleries_remove = []
            } = updates;
            
            delete updates.articles_new;
            delete updates.articles_add;
            delete updates.articles_remove;
            delete updates.galleries_add;
            delete updates.galleries_remove;
            
            story
                .fetch({ require: true })
                .then(updateStory)
                .catch(Story.NotFoundError, ferror(ferror.NOT_FOUND).trip(reject))
                .catch(ferror.constraint(reject));

            function updateStory() {
                Promise
                    .all([
                        _.isEmpty(updates) ? Promise.resolve() : story.save(updates, { patch: true, method: 'update', transacting: _trx }),
                        makeArticles(),
                        story.articles().attach(articles_add, { transacting: _trx }),
                        story.articles().detach(articles_remove, { transacting: _trx }),
                        story.galleries().attach(galleries_add, { transacting: _trx }),
                        story.galleries().detach(galleries_remove, { transacting: _trx }),
                    ])
                    .then(done)
                    .catch(ferror.constraint(reject));
            }

            function makeArticles() {
                if (!articles_new.length) return Promise.resolve();
                return ArticleController
                    .createMany(user_model, articles_new, _trx)
                    .then(articles => 
                        Promise.each(articles, article => 
                            article.stories().attach(story.get('id'), { transacting: _trx })
                        )
                    )
                    .catch(ferror.constraint(reject));
            }

            function done() {
                resolve(story);
            }
        });
    }
    
    /**
     * Search for stories using fulltext search
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
    search(user_model, {
        q,
        a,
        created_before,
        created_after,
        updated_before,
        updated_after,
        tags,
        geo,
        radius,
        count = true,
        geo_where = 'intersects',
        last,
        limit = 10,
        sortBy = 'created_at',
        direction = 'desc'
    } = {}, trx) {
        let autocomplete_by

        q = q && q.trim ? q.trim() : q;
        a = a && a.trim ? a.trim() : a;

        if (a) {
            autocomplete_by = (Object.keys(a)[0] || '');
            if(!Story.COLUMNS.includes(autocomplete_by)) {
                return Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Your autocomplete field is invalid!')
                );
            }
        }

        return Story
            .query(qb => {
                let inner_qb = Story.knex('stories').select('stories.*');
                let last_qb = Story.knex('stories').select('*').where('id', last).limit(1);

                if (count) inner_qb.select(Story.knex.raw('COUNT(*) OVER() AS __result_count'));

                // FTS query if querystring provided
                if (q) {
                    inner_qb.from(Story.knex.raw('stories, PLAINTO_OR_TSQUERY(?) AS "_fts_query"', [q]))
                    inner_qb.select(Story.knex.raw('TS_RANK("_fts", "_fts_query") AS "_fts_rank"'))
                    inner_qb.whereRaw('?? @@ ??', ['_fts', '_fts_query']);
                    sortBy = '_fts_rank';

                    if (last) {
                        last_qb.select(Story.knex.raw('TS_RANK("_fts", PLAINTO_OR_TSQUERY(?)) AS "_fts_rank"', [q]));
                    }
                } else if (autocomplete_by) {
                    inner_qb.select(
                        Story.knex.raw(
                            `LENGTH(REGEXP_REPLACE("stories".??, ?, '','i')) AS _autocomp_score`,
                            [autocomplete_by, a[autocomplete_by] + '.*']
                        )
                    );
                    last_qb.select(
                        Story.knex.raw(
                            `LENGTH(REGEXP_REPLACE("stories".??, ?, '','i')) AS _autocomp_score`,
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
                if (updated_before) {
                    inner_qb.where('updated_at', '<', updated_before);
                }
                if (updated_after) {
                    inner_qb.where('updated_at', '>', updated_after);
                }
                if (geo) {
                    Story.queryGeo(inner_qb, { geoJson: geo, radius, where: geo_where });
                }
                if (tags) {
                    if (!_.isArray(tags)) tags = [tags];
                    inner_qb.whereRaw('"stories"."tags" @> ?', [tags]);
                }

                let from_query = `(${inner_qb.toString()}) AS stories`;

                if (last) {
                    qb.where(function() {
                        this.where('stories.' + sortBy, direction === 'asc' ? '>' : '<', Story.knex.raw('last_story.' + sortBy))
                        this.orWhere(function() {
                            this.where('stories.' + sortBy, Story.knex.raw('last_story.' + sortBy));
                            this.where('stories.id', '<', Story.knex.raw('last_story.id'));
                        });
                    });
                    from_query += `, (${last_qb.toString()}) AS last_story`;
                }

                qb.from(Story.knex.raw(from_query));
                qb.select(...Story.GEO_FILTERS.ALL);
                if (count) qb.select('stories.__result_count');
                qb.orderBy('stories.' + sortBy, direction);
                if (sortBy === '_autocomp_score') qb.orderBy('stories.' + autocomplete_by, direction);
                qb.orderBy('stories.id', 'desc');

                qb.limit(limit);
            })
            .fetchAll({ transacting: trx })
            .then(story_collection => {
                let count = 0;
                for (let story_model of story_collection.models) {
                    count = parseInt(story_model.get('__result_count'), 10);
                    story_model.unset('__result_count');
                }

                return Promise.resolve({ count, results: story_collection.models });
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }
}

module.exports = new StoryController;

// Controllers here to avoid circular requires
const ArticleController = require('./Article');
const CommentController = require('./Comment');
const PostController = require('./Post');
const UserController = require('./User');