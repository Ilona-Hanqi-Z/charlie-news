'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const superagent = require('superagent');
const cheerio = require('cheerio');
const parseDomain = require('parse-domain');

const config = require('../config');

const ferror = require('../lib/frescoerror');

const Article = require('../models/article');
const Gallery = require('../models/gallery');
const Outlet = require('../models/outlet');
const Story = require('../models/article');

class ArticleController {

    /**
     * Attaches stats and social fields to article(s)
     * 
     * @param articles
     * @param article_model
     */
    build(user_model, articles, {
        filter = Article.FILTERS.PUBLIC,
        keep_fields = [],
        show_outlet = false,
        build_outlet = {},
        trx
    } = {}) {
        if (!articles) return Promise.resolve();

        let isArr = true;
        if(!_.isArray(articles)) {
            isArr = false;
            articles = [articles];
        }
        if (articles.length === 0) return Promise.resolve(articles);

        // map: Hashmap, hash being the related id, and value being an array of gallery models that share that relationship
        // ids: Array of all article ids that need this relationship resolved
        // build: Array of models to call the respective Controller#build function on, after fetching all relations
        let references = {
            articles: { map: {}, ids: [] }, // map: article id -> article model hashmap, ids = array of all article ids
            outlets: { map: {}, ids: [] }
        };

        for (let article of articles) {
            let _article_id = article.get('id');
            let _outlet_id = article.get('outlet_id');

            article.columns(filter.concat(keep_fields));
            article.trigger('fetched', article);

            references.articles.ids.push(_article_id);
            references.articles.map[_article_id] = article;

            // NOTE defaults are set below because if articles have no results
            // in the corresponding query, they will not be included in the
            // query results

            if (show_outlet) {
                if (article.relations.outlet && !article.relations.outlet.isNull()) {
                    references.outlets.build.push(article.relations.outlet);
                } else {
                    article.relations.outlet = Outlet.nullable();

                    if (_outlet_id) {
                        if (!references.outlets.map[_outlet_id]) {
                            references.outlets.map[_outlet_id] = [article];
                            references.outlets.ids.push(_outlet_id);
                        } else {
                            references.outlets.map[_outlet_id].push(article);
                        }
                    }
                }
            } else {
                delete article.relations.outlet;
            }
        }

        return Promise.all([
                // Article outlet promise
                new Promise((yes, no) => {
                    if (!show_outlet) return yes();
                    Outlet.knex('outlets')
                        .select('*')
                        .whereIn('id', references.outlets.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _outlet = Outlet.forge(row);
                                references.outlets.map[row.id].forEach(post => post.relations.outlet = _outlet);
                                references.outlets.build.push(_outlet);
                            }

                            OutletController
                                .build(user_model, references.outlets.build, Object.assign({
                                    filter: Outlet.FILTERS.PREVIEW,
                                    trx
                                }, build_outlet))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                }),
            ])
            .then(() => Promise.resolve(isArr ? articles : articles[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Create an article
     * 
     * @param user_model {Model}
     * @param params {object}
     * @param params.title {string}
     * @param params.link {string}
     * @param params.favicon {string}
     */
    create(user_model, params = {}, _trx) {
        return new Promise((resolve, reject) => {
            let article = new Article(params);

            article
                .save(null, { method: 'insert', transacting: _trx })
                .then(fetch)
                .catch(ferror.constraint(reject));

            function fetch() {
                if (_trx) return resolve(article);

                article
                    .fetch({ columns: Article.FILTERS.PUBLIC })
                    .then(resolve)
                    .catch(ferror.constraint(reject));
            }
        });
    }

    /**
     * Make and attach articles created via `articles_new`
     * 
     * @param user_model {Model}
     * @param parent_model {Model}
     * @param articles_new {object[]}
     * 
     * @returns {int[]}
     */
    makeBulk(user_model, parent_model, articles_new = [], _trx) {
        return new Promise((resolve, reject) => {
            if (!articles_new.length) return resolve([]);

            Promise
                .map(articles_new, (article) => {
                    return this
                        .getMetaForURL(article.link)
                        .then(meta => {
                            return Object.assign(article, {
                                title: article.title || meta.title, 
                                favicon: article.favicon || meta.favicon 
                            });
                        })
                        .catch(err => {
                            return Object.assign(article, {
                                title: article.title || 'Title not found',
                                favicon: article.favicon || `${article.link}/favicon.ico`
                            })
                        })
                })
                .then(() => {
                    insert(articles_new)
                })

            function insert() {
                let query = Article.knex('articles').insert(articles_new).returning('id');
                if (_trx) query.transacting(_trx);

                query
                    .then(relate)
                    .catch(ferror.constraint(reject));

                function relate(article_ids) {
                    parent_model
                        .articles()
                        .attach(article_ids, { transacting: _trx })
                        .then(() => resolve(article_ids))
                        .catch(ferror.constraint(reject))
                }
            }
        });
    }
    
    /**
     * Returns a meta object with a favicon and a url
     * @description Elmir Kouliev wrote this, if you can any questions, hit me up — elmir@kouliev.com
     * I know this is messy, but it gets favicons in almost all cases
     */
    getMetaForURL(url) {
        return new Promise((resolve, reject) => {
            superagent
                .get(url)
                .redirects(5)
                .timeout(5000)
                .end((err, res) => {
                    if(err) return reject(err);

                    const domainParts = parseDomain(url);
                    const rootUrl = `${domainParts.subdomain ? domainParts.subdomain + '.' : ''}${domainParts.domain}.${domainParts.tld}`;

                    let $ = cheerio.load(res.text);
                    let title = $('title').text();
                    title = title.replace(/\\/g, '');
                    let favicon = '';

                    //Grab link
                    const linkTags = $('link');
                    const keys = Object.keys(linkTags);

                    for (let i = 0; i < keys.length; i++) {
                        const item = linkTags[keys[i]];

                        //Check for favicon type
                        if(item.attribs && item.attribs.rel){
                            //prioritize this `rel`, that's why we have the break
                            if(item.attribs.rel === 'shortcut icon') {
                                favicon = item.attribs.href;
                                break;
                            } else if(item.attribs.rel === 'icon'){
                                favicon = item.attribs.href;
                            }
                        }
                    }

                    //Go through all the conditions. Note: you can always add more TLDs to the condition list
                    if(favicon.indexOf('http') === -1 && (favicon.indexOf('com') === -1 && favicon.indexOf('net') === -1 && favicon.indexOf('org') === -1) && favicon !== '') {
                        favicon = `${rootUrl}${favicon}`
                    } else if(favicon == '') {
                        favicon = `${rootUrl}/favicon.ico`;
                    } else {
                        const firstLetter = /[a-z]/i.exec(favicon).index;
                        favicon = favicon.substr(firstLetter);
                    }

                    resolve({
                        title,
                        favicon
                    })
                });
        });
    }

    /**
     * Search for articles using fulltext search
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
     * 
     * @returns {Promise}
     */
    search(
        user_model, 
        { 
            q, a, // query, autocomplete
            created_before,
            created_after,
            count = true,
            last,
            limit = 10,
            sortBy = 'created_at',
            direction = 'desc'
        } = {},
        trx
    ) {
        q = q && q.trim ? q.trim() : q;
        a = a && a.trim ? a.trim() : a;

        let autocomplete_by
        if (a) {
            autocomplete_by = (Object.keys(a)[0] || '');
            if(!Article.COLUMNS.includes(autocomplete_by)) {
                return Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Your autocomplete field is invalid!')
                );
            }
        }

        return Article
            .query(qb => {
                let inner_qb = Article.knex('articles').select('articles.*');
                let last_qb = Article.knex('articles').select('*').where('id', last).limit(1);

                if (count) inner_qb.select(Article.knex.raw('COUNT(*) OVER() AS __result_count'));

                // FTS query if querystring provided
                if (q) {
                    inner_qb.from(Article.knex.raw('articles, PLAINTO_OR_TSQUERY(?) AS "_fts_query"', [q]))
                    inner_qb.select(Article.knex.raw('TS_RANK("_fts", "_fts_query") AS "_fts_rank"'))
                    inner_qb.whereRaw('?? @@ ??', ['_fts', '_fts_query']);
                    sortBy = '_fts_rank';

                    if (last) {
                        last_qb.select(Article.knex.raw('TS_RANK("_fts", PLAINTO_OR_TSQUERY(?)) AS "_fts_rank"', [q]));
                    }
                } else if (autocomplete_by) {
                    inner_qb.select(
                        Article.knex.raw(
                            `LENGTH(REGEXP_REPLACE("articles".??, ?, '','i')) AS _autocomp_score`,
                            [autocomplete_by, a[autocomplete_by] + '.*']
                        )
                    );
                    last_qb.select(
                        Article.knex.raw(
                            `LENGTH(REGEXP_REPLACE("articles".??, ?, '','i')) AS _autocomp_score`,
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

                let from_query = `(${inner_qb.toString()}) AS articles`;

                if (last) {
                    qb.where(function() {
                        this.where('articles.' + sortBy, direction === 'asc' ? '>' : '<', Article.knex.raw('last_article.' + sortBy))
                        this.orWhere(function() {
                            this.where('articles.' + sortBy, Article.knex.raw('last_article.' + sortBy));
                            this.where('articles.id', '<', Article.knex.raw('last_article.id'));
                        });
                    });
                    from_query += `, (${last_qb.toString()}) AS last_article`
                }

                qb.from(Article.knex.raw(from_query));
                qb.select('articles.*');
                if (count) qb.select('__result_count');
                qb.orderBy('articles.' + sortBy, direction);
                if (sortBy === '_autocomp_score') qb.orderBy('articles.' + autocomplete_by, direction)
                qb.orderBy('articles.id', 'desc');

                qb.limit(limit);
            })
            .fetchAll({ transacting: trx })
            .then(article_collection => {
                let result = { results: article_collection.models };

                if (count) {
                    let _count = 0;
                    for (let article_model of article_collection.models) {
                        _count = parseInt(article_model.get('__result_count'), 10);
                        article_model.unset('__result_count');
                    }
                    result.count = _count;
                }

                return result;
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }
};

module.exports = new ArticleController;

const OutletController = require('./Outlet');