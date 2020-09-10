'use strict';

const _ = require('lodash');
const Promise = require('bluebird');

const ferror = require('../lib/frescoerror');
const Report = require('../models/report');
const Gallery = require('../models/gallery');
const User = require('../models/user');

class ReportController {

    build(user_model, reports, {
        filter = Report.FILTERS.PUBLIC,
        keep_fields = [],
        show_user = false,
        show_gallery = false,

        build_user = {},
        build_gallery = {},

        trx
    } = {}) {
        if (!reports) return Promise.resolve();

        let isArr = _.isArray(reports);
        if (!isArr) {
            reports = [reports];
        }

        if (reports.length === 0) return Promise.resolve(reports);

        let references = {
            reports: { map: {}, ids: [] },
            users: { build: [], map: {}, ids: [] },
            galleries: { build: [], ids: [] }
        };

        for (let report of reports) {
            let report_id = report.get('id');
            let user_id = report.get('user_id');

            report.columns(filter.concat(keep_fields));
            report.trigger('fetched', report);

            references.reports.ids.push(report_id);
            references.reports.map[report_id] = report;

            if (show_user) {
                if (report.relations.user) {
                    references.users.build.push(report.relations.user);
                } else {
                    report.relations.user = User.nullable(); // Empty models represent null values

                    if (user_id) {
                        if (!references.users.map[user_id]) {
                            references.users.map[user_id] = [report];
                            references.users.ids.push(user_id);
                        } else {
                            references.users.map[user_id].push(report);
                        }
                    }
                }
            } else {
                delete report.relations.user;
            }
            if (show_gallery) {
                // Make a default empty array for stories without stories
                if (report.relations.gallery) {
                    references.galleries.build.push(report.relations.gallery);
                } else {
                    report.relations.gallery = Gallery.nullable();
                    references.galleries.ids.push(report_id);
                }
            } else {
                delete report.relations.gallery;
            }
        }

        return Promise
            .all([
                //User promise
                new Promise((yes, no) => {
                    if (!show_user) return yes();

                    User.knex('users')
                        .select(User.FILTERS.PREVIEW)
                        .whereIn('id', references.users.ids)
                        .where(qb => User.QUERIES.ACTIVE(qb))
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let user = User.forge(row);
                                references.users.map[row.id].forEach(report => report.relations.user = user);
                                references.users.build.push(user);
                            }

                            UserController
                                .build(user_model, references.users.build, Object.assign({
                                    filter: User.FILTERS.PUBLIC,
                                    show_social_stats: true,
                                    show_submission_stats: true,
                                    show_report_stats: true,
                                    trx
                                }, build_user))
                                .then(yes)
                                .catch(no);
                        }).catch(no);
                }),
                new Promise((yes, no) => {
                    if (!show_gallery) return yes();

                    Gallery.knex('galleries')
                        .select(...Gallery.GEO_FILTERS.PUBLIC, 'gallery_reports.report_id')
                        .innerJoin('gallery_reports', 'gallery_reports.gallery_id', 'galleries.id')
                        .whereIn('gallery_reports.report_id', references.reports.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let gallery = Gallery.forge(row);
                                references.reports.map[row.report_id].relations.gallery = gallery;
                                references.galleries.build.push(gallery);
                            }

                            GalleryController
                                .build(user_model, references.galleries.build, Object.assign({
                                    filter: Gallery.FILTERS.PUBLIC,
                                    show_owner: true,
                                    show_curator: true,
                                    show_stories: true,
                                    show_articles: true,
                                    show_posts: true,
                                    show_stats: true, 
                                    trx
                                }, build_gallery))
                                .then(yes)
                                .catch(no)
                        }).catch(no);
                })
            ])
            .then(() => Promise.resolve(isArr ? reports : reports[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    get(user_model, ids = [], trx) {
        return new Promise((resolve, reject) => {
            let isArr = _.isArray(ids);
            if (!isArr) {
                ids = [ids];
            }

            Report
                .query(qb => {
                    qb.select(Report.FILTERS.PUBLIC);
                    qb.whereIn('id', ids);
                })
                .fetchAll({
                    require: true,
                    transacting: trx
                })
                .then(cs => {
                    if (isArr) {
                        resolve(cs.models);
                    } else if (cs.length) {
                        resolve(cs.models[0]);
                    }
                    else {
                        reject(ferror(ferror.NOT_FOUND));
                    }
                })
                .catch(Report.Collection.EmptyError, ferror(ferror.NOT_FOUND).msg('Report(s) not found').trip(reject))
                .catch(reject);
        });
    }

    make(user_model, reason, message, trx) {
        return new Promise((resolve, reject) => {
            message = message.trim();

            let report_model = new Report({
                reason,
                message,
                user_id: user_model.get('id')
            });

            report_model
                .save(null, { patch: false, method: 'insert', transacting: trx})
                .then(resolve)
                .catch(ferror.constraint(reject));
        });
    }
}

module.exports = new ReportController;

const GalleryController = require('./Gallery');
const UserController = require('./User');