'use strict';

const _ = require('lodash');
const AWS = require('aws-sdk');
const crypto = require('crypto');
const gm = require('gm');
const Promise = require('bluebird');

const config = require('../../config');

const ferror = require('../../lib/frescoerror');
const hashids = require('../../lib/hashids');
const stripe = require('../../lib/stripe');
const mandrill = require('../../lib/mandrill');
const reporter = require('../../lib/reporter');

const Outlet = require('../../models/outlet');
const OutletInvite = require('../../models/outlet_invite');
const Post = require('../../models/post');
const User = require('../../models/user');
const Purchase = require('../../models/purchase');

const s3 = new AWS.S3();

class OutletController {

    /**
     * Attaches stats and social fields to outlet(s)
     * 
     * @param outlets
     * @param outlet_model
     */
    build(user_model, outlets, {
        filter = Outlet.FILTERS.PUBLIC,
        keep_fields = [],
        show_owner = false,
        show_members = false,
        build_owner = {},
        build_members = {},
        trx
    } = {}) {
        if (!outlets) return Promise.resolve();

        let isArr = true;
        if(!_.isArray(outlets)) {
            isArr = false;
            outlets = [outlets];
        }
        if (outlets.length === 0) return Promise.resolve(outlets);

        // map: Hashmap, hash being the related id, and value being an array of gallery models that share that relationship
        // ids: Array of all outlet ids that need this relationship resolved
        // build: Array of models to call the respective Controller#build function on, after fetching all relations
        let references = {
            outlets: { map: {}, ids: [] }, // map: outlet id -> outlet model hashmap, ids = array of all outlet ids
            owners: { build: [], map: {}, ids: [] },
            members: { build: [], ids: [] }
        };

        for (let outlet of outlets) {
            let _outlet_id = outlet.get('id');
            let _owner_id = outlet.get('owner_id');
            outlet.columns(filter.concat(keep_fields));
            outlet.trigger('fetched', outlet);

            references.outlets.ids.push(_outlet_id);
            references.outlets.map[_outlet_id] = outlet;

            // NOTE defaults are set below because if outlets have no results
            // in the corresponding query, they will not be included in the
            // query results

            if (show_owner) {
                if (outlet.relations.owner) {
                    references.owners.build.push(outlet.relations.owner);
                } else {
                    outlet.relations.owner = User.nullable(); // Empty models represent null values

                    if (_owner_id) {
                        if (!references.owners.map[_owner_id]) {
                            references.owners.map[_owner_id] = [outlet];
                            references.owners.ids.push(_owner_id);
                        } else {
                            references.owners.map[_owner_id].push(outlet);
                        }
                    }
                }
            } else {
                delete outlet.relations.owner;
            }
            if (show_members) {
                if (outlet.relations.members) {
                    references.members.build = references.members.build.concat(outlet.relations.members.models);
                } else {
                    outlet.relations.members = User.Collection.forge();
                    references.members.ids.push(_outlet_id);
                }
            } else {
                delete outlet.relations.members;
            }
        }

        return Promise.all([
                // Outlet owner promise
                new Promise((yes, no) => {
                    if (!show_owner) return yes();
                    User.knex('users')
                        .select('*')
                        .whereIn('id', references.owners.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _owner = User.forge(row);
                                references.owners.map[row.id].forEach(post => post.relations.owner = _owner);
                                references.owners.build.push(_owner);
                            }

                            UserController
                                .build(user_model, references.owners.build, Object.assign({
                                    filter: User.FILTERS.PREVIEW,
                                    trx
                                }, build_owner))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                }),
                // Members promise
                new Promise((yes, no) => {
                    if (!show_members) return yes();

                    User.knex
                        .from('users')
                        .select('users.*')
                        .whereIn('users.outlet_id', references.members.ids)
                        .transacting(trx)
                        .then((rows = []) => {
                            for (let row of rows) {
                                let _user = User.forge(row);
                                references.outlets.map[row.outlet_id].relations.members.push(_user);
                                references.members.build.push(_user);
                            }

                            UserController
                                .build(user_model, references.members.build, Object.assign({
                                    filter: User.FILTERS.PREVIEW,
                                    keep_fields: ['email', 'phone'],
                                    trx
                                }, build_members))
                                .then(yes)
                                .catch(no);
                        }).catch(no);
                })
            ])
            .then(() => Promise.resolve(isArr ? outlets : outlets[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Gets an outlet
     * @param  {string} outletId The outlet's ID to get
     * @return {Object} The outlet ID
     */
    get(user_model, id, trx, related = []) {
        if (!id) {
            return Promise
                .reject(ferror(ferror.INVALID_REQUEST).msg('Missing outlet'));
        }

        return Outlet
            .forge({ id })
            .fetch({
                require: true,
                transacting: trx,
                withRelated: related
            })
            .catch(Outlet.NotFoundError, () => Promise.reject(ferror(ferror.NOT_FOUND)))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Alerts all outlets who, within the last week, haven't posted
     * within 24 hours of their inactivity.
     * 
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    alertInactive(trx) {
        let body = '<br/><br/>We noticed that you haven’t put out an assignment during the last 24 hours. Your assignments will get the best response rates if you keep up the momentum and offer a steady flow of assignments for users in your area to fulfill. Sending out assignments regularly will help you cultivate an active and engaged user base that will provide high-quality content that you can use.<br/><br/>';
        body += 'For ideas about the best ways to use Fresco dispatch, please check out our ';
        body += NotificationController.Mediums.Email.createEmailLink({ link: 'https://www.youtube.com/playlist?list=PLbYhNm7s63x8tJGiJ4VjBKmZ263KdRjWL', content: '“Best of Fresco”', absolute: true })
        body += ' playlist on YouTube.<br/><br/>'
        body += 'Please contact us if there’s anything we can do for you, and thank you for using Fresco!'

        return Outlet
            .query(qb => {
                qb.select('outlets.*');
                qb.from(function() {
                    this.select('outlet_id');
                    this.max('created_at AS last_active_at');
                    this.from('assignment_outlets');
                    this.where('created_at', '>', Outlet.knex.raw("CURRENT_TIMESTAMP - INTERVAL '7 days'"));
                    this.groupBy('outlet_id');
                    this.as('ao');
                });
                qb.innerJoin('outlets', 'outlets.id', 'ao.outlet_id');
                qb.where('outlets.dispatch_enabled', true);
                qb.where('outlets.verified', true);
                qb.where('ao.last_active_at', '<', Outlet.knex.raw("CURRENT_TIMESTAMP - INTERVAL '24 hours'"));
            })
            .fetchAll({
                withRelated: ['members', 'members.roles'],
                transacting: trx
            })
            .then(outlet_collection =>
                Promise.each(outlet_collection.models, outlet_model => {
                    let users = outlet_model.related('members').models;
                    users = users.filter(mem => mem.can('outlet', 'create', 'assignment'));
                    if (users.length === 0) return;

                    NotificationController
                        .notify({
                            type: 'outlet-inactive',
                            recipients: { users },
                            payload: {
                                email: {
                                    subject: 'Inactivity Alert',
                                    title: 'Inactivity Alert',
                                    body: `Hello, ${outlet_model.get('title')}!` + body
                                }
                            }
                        })
                        .catch(reporter.report)
                })
            )
            .then(() => Promise.resolve({ result: 'ok' }))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Creates a new outlet
     * @param user_id
     * @param title
     * @param link
     */
    create(user_model, { title, link = '', type = '', state = '', source = '' }, trx) {
        if (!title) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .param('outlet[title]')
                    .msg('Missing outlet title')
            );
        }

        return new Outlet({
                owner_id: user_model.get('id'),
                title,
                link
            })
            .save(null, { transacting: trx })
            .then(outlet => this.Payment.generateNewCustomer(outlet, trx)) // Generate Stripe customer for outlet
            .then(outlet => // Add user to outlet
                user_model
                    .save({ outlet_id: outlet.get('id') }, { transacting: trx })
                    .then(() => user_model.relations.outlet = outlet)
            )
            .then(outlet => this.Zoho.createZohoLead(user_model, outlet, type, state, source))
            .then(outlet => {
                let emailLink = NotificationController.Mediums.Email.createEmailLink({
                    link: 'mailto:support@fresconews.com',
                    content: 'support@fresconews.com',
                    absolute: true
                });

                NotificationController.Mediums.Email.send(user_model.get('email'), {
                    subject: 'Thanks for signing up to use Fresco!',
                    title: 'Thanks for signing up to use Fresco!',
                    body: `Thank you for signing up for Fresco's publisher tools. Fresco gets you access to over 130,000 on-demand videographers, our global archive of organic submissions, and 24/7 support. Please email ${emailLink} to request access for a fully functional account, which lets you create dispatches on the Fresco platform.`
                });

                return outlet;
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Updates an outlet on Fresco, and then updates on Stripe as well
     */
    update(user_model, updates = {}, trx) {
        return new Promise((resolve, reject) => {
            let _this = this;

            user_model.related('outlet')
                .save(updates, { patch: true, transacting: trx })
                .then(updateStripe)
                .catch(ferror.constraint(reject))
            
            //Updates outlet meta on Stripe's side
            function updateStripe() {
                _this.Payment
                    .updateInfo(user_model.related('outlet'), trx)
                    .then(resolve)
                    .catch(ferror.trip(reject))
            }
        })
    }

    /**
     * Search for outlet based on fts
     * 
     * @param {Model} user_model
     * @param {Model} user_model
     * @param {Object} options
     * @param {String} options.q
     * @param {Integer} options.last
     * @param {Integer} options.limit
     */
    search(user_model, { q, a, created_before, created_after, count = true, last, limit = 10, sortBy = 'created_at', direction = 'desc' } = {}, trx) {
        // If query is blank, limit 0 so object returned is an empty collection
        if ((!user_model || !user_model.can('admin', 'get', 'outlet')) && !q) {
            let result = { results: [] };
            if (count) result.count = 0;
            return Promise.resolve(result);
        }

        let autocomplete_by

        q = q && q.trim ? q.trim() : q;
        a = a && a.trim ? a.trim() : a;

        if (a) {
            autocomplete_by = (Object.keys(a)[0] || '');
            if(!Outlet.COLUMNS.includes(autocomplete_by)) {
                return Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Your autocomplete field is invalid!')
                );
            }
        }

        return Outlet
            .query(qb => {
                let inner_qb = Outlet.knex('outlets').select('outlets.*');
                let last_qb = Outlet.knex('outlets').select('*').where('id', last).limit(1);

                if (count) inner_qb.select(Outlet.knex.raw('COUNT(*) OVER() AS __result_count'));

                // FTS query if querystring provided
                if (q) {
                    inner_qb.from(Outlet.knex.raw('outlets, PLAINTO_OR_TSQUERY(?) AS "_fts_query"', [q]))
                    inner_qb.select(Outlet.knex.raw('TS_RANK("_fts", "_fts_query") AS "_fts_rank"'))
                    inner_qb.whereRaw('?? @@ ??', ['_fts', '_fts_query']);
                    sortBy = '_fts_rank';

                    if (last) {
                        last_qb.select(Outlet.knex.raw('TS_RANK("_fts", PLAINTO_OR_TSQUERY(?)) AS "_fts_rank"', [q]));
                    }
                } else if (autocomplete_by) {
                    inner_qb.select(
                        Outlet.knex.raw(
                            `LENGTH(REGEXP_REPLACE("outlets".??, ?, '','i')) AS _autocomp_score`,
                            [autocomplete_by, a[autocomplete_by] + '.*']
                        )
                    );
                    last_qb.select(
                        Outlet.knex.raw(
                            `LENGTH(REGEXP_REPLACE("outlets".??, ?, '','i')) AS _autocomp_score`,
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

                let from_query = `(${inner_qb.toString()}) AS outlets`;

                if (last) {
                    qb.where(function() {
                        this.where('outlets.' + sortBy, direction === 'asc' ? '>' : '<', Outlet.knex.raw('last_outlet.' + sortBy))
                        this.orWhere(function() {
                            this.where('outlets.' + sortBy, Outlet.knex.raw('last_outlet.' + sortBy));
                            this.where('outlets.id', '<', Outlet.knex.raw('last_outlet.id'));
                        });
                    });
                    from_query += `, (${last_qb.toString()}) AS last_outlet`
                }

                qb.from(Outlet.knex.raw(from_query));
                qb.select('outlets.*');
                if (count) qb.select('__result_count');
                qb.orderBy('outlets.' + sortBy, direction);
                if (sortBy === '_autocomp_score') qb.orderBy('outlets.' + autocomplete_by, direction);
                qb.orderBy('id', 'desc');

                qb.limit(limit);
            })
            .fetchAll({ transacting: trx })
            .then(outlet_collection => {
                let result = { results: outlet_collection.models };

                if (count) {
                    let _count = 0;
                    for (let outlet_model of outlet_collection.models) {
                        _count = parseInt(outlet_model.get('__result_count'), 10);
                        outlet_model.unset('__result_count');
                    }
                    result.count = _count;
                }

                return result;
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
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

            gm(image.buffer, key)
                .noProfile()
                .toBuffer((err, buffer) => {
                    if (err) return reject(ferror(ferror.API).msg('Error processing image file'));

                    s3.putObject({
                        Bucket: config.AWS.S3.BUCKET,
                        ACL: 'public-read',
                        ContentType: image.mimetype,
                        ContentDisposition: 'inline',
                        Key: config.AWS.S3.UPLOAD_DIRECTORY + key + '.' + extension,
                        Body: buffer
                    }, (err, data) => {
                        if (err) reject(ferror(err).msg('Error saving image file'));
                        else done(config.AWS.CLOUDFRONT.AVATAR_URL + key + config.AWS.CLOUDFRONT.IMAGE_EXTENSION);
                    });
                });

            function done(avatar) {
                user_model.related('outlet')
                    .save({ avatar }, { patch: true, transacting: trx })
                    .then(r => resolve(user_model.related('outlet').columns(Outlet.FILTERS.SELF)))
                    .catch(ferror.constraint(reject));
            }
        });
    }

    statement(user_model) {
        let knex = Purchase.knex;
        return Purchase
            .query(qb => {
                qb.select(
                    knex.raw(`purchases.created_at AS "created_at"`),
                    knex.raw(`CASE WHEN posts.video NOTNULL THEN 'Video' ELSE 'Photo' END AS "type"`),
                    knex.raw(`posts.address AS "address"`),
                    knex.raw(`assignments.id AS "assignment_id"`),
                    knex.raw(`assignments.title AS "assignment_title"`),
                    knex.raw(`purchases.post_id AS "post_id"`)
                );
                qb.from('purchases');
                qb.innerJoin('posts', 'purchases.post_id', 'posts.id');
                qb.leftJoin('assignments', 'purchases.assignment_id', 'assignments.id');
                qb.where('purchases.outlet_id', user_model.related('outlet').get('id'));
                qb.orderBy('purchases.created_at', 'desc');
            })
            .fetchAll()
            .then(purchases => sendEmail(purchases.models));

        function sendEmail(purchases) {
            return new Promise((resolve, reject) => {

                var table = '<table>' +
                    '<tr>' +
                    '	<th>Local time</th>' +
                    '	<th>Type</th>' +
                    '	<th>Location</th>' +
                    '	<th>Assignment</th>' +
                    '	<th class="price">Price ($)</th>' +
                    '</tr>';

                purchases.forEach(function(purchase, index){
                    table += formatStatementLine(purchase, index);
                });

                function formatStatementLine(purchase, index){

                    function encode(id) {
                        return hashids.encode(parseInt(id, 10));
                    }

                    var assignmentText = 'None';
                    if (purchase.get('assignment_id')){
                        assignmentText = '<a href="' + config.SERVER.WEB_ROOT + 'assignment/' + encode(purchase.get('assignment_id')) + '">' + purchase.get('assignment_title') + '</a>';
                    }

                    var typeText = '<a href="' + config.SERVER.WEB_ROOT + 'post/' + encode(purchase.get('post_id')) + '">' + purchase.get('type') + '</a>';

                    var year = purchase.get('created_at').getFullYear(),
                        month = purchase.get('created_at').getMonth() + 1,
                        date = purchase.get('created_at').getDate(),
                        hours = purchase.get('created_at').getHours() % 12,
                        minutes = purchase.get('created_at').getMinutes(),
                        pm = purchase.get('created_at').getHours() >= 12;
                    if(minutes < 10) minutes = '0' + minutes.toString();
                    var dateText = year + '-' + month + '-' + date + ', ' + hours + ':' + minutes + ' ' + (pm ? 'PM' : 'AM');

                    function formatMoney(money){
                        return '$' + (money / 100).toFixed(2);
                    }
                    let price = formatMoney(purchase.get('type') == 'Video' ? config.APPLICATION.PRICES.VIDEO : config.APPLICATION.PRICES.IMAGE);

                    return '<tr' + (index % 2 == 1 ? ' bgcolor="lightgray"' : '') + '>' +
                        '<td>' + dateText + '</td>' +
                        '<td>' + typeText + '</td>' +
                        '<td>' + purchase.get('address') + '</td>' +
                        '<td>' + assignmentText + '</td>' +
                        '<td class="price">' + price + '</td>' +
                        '</tr>'
                }

                table += '</table>';

                var monthNames = ["January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"
                ];

                var year = purchases[0].get('created_at').getFullYear(),
                    month = monthNames[purchases[0].get('created_at').getMonth()],
                    date = purchases[0].get('created_at').getDate(),
                    hours = purchases[0].get('created_at').getHours() % 12,
                    minutes = purchases[0].get('created_at').getMinutes(),
                    pm = purchases[0].get('created_at').getHours() >= 12;
                if(minutes < 10) minutes = '0' + minutes.toString();
                var lastUpdated = month + ' ' + date + ', ' + year + ', ' + hours + ':' + minutes + ' ' + (pm ? 'PM' : 'AM');

                mandrill.messages.sendTemplate({
                    template_name: 'outlet-statement',
                    template_content: [
                        {
                            name: 'LAST_UPDATED',
                            content: lastUpdated
                        },
                        {
                            name: 'TABLE',
                            content: table
                        }
                    ],
                    message: {
                        inline_css: true,
                        subject: "Your Statement",
                        from_email: "donotreply@fresconews.com",
                        from_name: 'Fresco News',
                        to: [{ email: user_model.get('email') }]
                    }
                }, function(result){
                    if (result[0].status == 'rejected' || result[0].status == 'invalid')
                        return reject(result);
                    return resolve(result);
                });
            });
        }
    }

    stats(user_model, {
        before,
        after,
        outlet_ids
    } = {}) {
        let is_admin = user_model.can('admin', 'get', 'outlet');

        if (outlet_ids && !is_admin) {
            return Promise.reject(new ferror(ferror.FORBIDDEN));
        }

        if (!is_admin || !outlet_ids) {
            outlet_ids = [user_model.related('outlet').get('id')];
        }

        let outlet_stats = {};
        for (let outlet_id of outlet_ids) {
            outlet_stats[outlet_id] = {
                outlet_id,
                purchase_count: 0,
                photo_count: 0,
                video_count: 0,
                assignment_count: 0
            };
        }

        return Promise
            .all([
                // Purchases promise
                new Promise((yes, no) => {
                    Purchase
                        .query(qb => {
                            qb.select(
                                'purchases.outlet_id',
                                Purchase.knex.raw('COUNT(*) as purchase_count'),
                                Purchase.knex.raw('SUM(CASE WHEN posts.video IS NULL THEN 1 ELSE 0 END) as photo_count'),
                                Purchase.knex.raw('SUM(CASE WHEN posts.video IS NULL THEN 0 ELSE 1 END) as video_count')
                            );
                            qb.innerJoin('posts', 'purchases.post_id', 'posts.id');
                            qb.whereIn('purchases.outlet_id', outlet_ids);

                            if (before) {
                                qb.where('purchases.created_at', '<', before);
                            }
                            if (after) {
                                qb.where('purchases.created_at', '>', after);
                            }

                            qb.groupBy('purchases.outlet_id');
                        })
                        .fetchAll()
                        .then(stat_coll => {
                            yes(stat_coll.models)
                        })
                        .catch(ferror.constraint(no));
                }),
                // Assignment promise
                new Promise((yes, no) => {
                    Purchase
                        .query(qb => {
                            qb.select(
                                'outlet_id',
                                Purchase.knex.raw('COUNT(*) AS assignment_count')
                            );
                            qb.from('assignment_outlets');
                            qb.whereIn('outlet_id', outlet_ids);

                            if (before) {
                                qb.where('assignment_outlets.created_at', '<', before);
                            }
                            if (after) {
                                qb.where('assignment_outlets.created_at', '>', after);
                            }

                            qb.groupBy('outlet_id');
                        })
                        .fetchAll()
                        .then(stat_coll => {
                            yes(stat_coll.models);
                        })
                        .catch(ferror.constraint(no));
                })
            ])
            .then(([purchase_stats, assignment_stats] = []) => {
                for (let purchases of purchase_stats) {
                    outlet_stats[purchases.get('outlet_id')].purchase_count = parseInt(purchases.get('purchase_count'));
                    outlet_stats[purchases.get('outlet_id')].photo_count = parseInt(purchases.get('photo_count'));
                    outlet_stats[purchases.get('outlet_id')].video_count = parseInt(purchases.get('video_count'));
                }

                for (let assignments of assignment_stats) {
                    outlet_stats[assignments.get('outlet_id')].assignment_count = parseInt(assignments.get('assignment_count'));
                }

                let result = [];
                for (let stats in outlet_stats) {
                    result.push(outlet_stats[stats]);
                }

                return result;
            });
    }

    /**
     * Sends a dispatch request to `sales@fresconews`. Grabs info from the requesting user's outlet and owner
     * @param  {String} options.comment Comment send my requester
     */
    requestDispatch(user_model, { comment = ''}) {
        const outlet_id = user_model.related('outlet').get('id');

        return this
            .get(user_model, user_model.related('outlet').get('id'), null, ['owner'])
            .then(outlet => {
                const title = outlet.get('title');

                const outletLink = NotificationController.Mediums.Email.createEmailLink({
                    link: `outlet/outlet/${hashids.encode(outlet_id)}`,
                    content: 'outlet'
                });

                const emailBody = `
                    ${title} is requesting access to dispatch. View their ${outletLink} on Fresco <br/>
                    Outlet Owner Name: ${outlet.related('owner').get('full_name')}<br />
                    Outlet Owner Email: ${outlet.related('owner').get('email')} <br />
                    Requester Name: ${user_model.get('full_name')}<br />
                    Requester Email: ${user_model.get('email')}<br />
                    Requester ID: ${hashids.encode(user_model.get('id'))}<br />
                    Comment: ${comment}`;

                return NotificationController.Mediums.Email
                    .send(['sales@fresconews.com'], {
                        title: 'Dispatch Request!',
                        subject: `${title} has requested access to dispatch!`,
                        body: emailBody
                    })
                    .then(() => Promise.resolve({ success: 'ok' }))
                    .catch(e => Promise.reject(ferror.constraint(e)))
            })
            .catch(ferror.constraint(Promise.reject));
    }

    /**
     * Verifies an outlet and notifies its members of verification 
     * @param {Object} outlet The outlet model to verify
     * @param {Boolean} notify Whether to notify outlet members
     * @return {Object} The outlet ID
     */
    verify(outlet_id, notify = false, trx) {
        return this
            .get(null, hashids.decode(outlet_id), trx)
            .then(outlet => {
                if (outlet.get('verified')) {
                    return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .msg('This outlet is already verified!')
                    );
                }

                return outlet
                    .save(
                        {verified: true},
                        {patch: true, transacting: trx}
                    );
            })
            .then(outlet => {
                return outlet
                    .related('members')
                    .fetch({ transacting: trx })
                    .then(() => {
                        const recipients = outlet.related('members').models.map(m => m.get('email'));

                        const frescoLink = NotificationController.Mediums.Email.createEmailLink({
                            link: 'archive',
                            content: 'fresconews.com',
                            referral: {
                                type: 'email',
                                email_name: 'outlet-verified'
                            }
                        });

                        NotificationController.Mediums.Email
                            .send(recipients, {
                                title: 'Outlet Verified',
                                subject: 'Your outlet has been verified!',
                                body: `Congratulations, your outlet "${outlet.title}" has been verified! Visit ${frescoLink} to begin using the platform!`,
                            })
                            .catch(reporter.report)
                    });
            })
            .then(() => Promise.resolve({ success: 'ok' }))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Enables dispatch on an outlet, optionally notifies members of new state
     * @param {Object} outlet The outlet model to verify
     * @param {Boolean} notify Whether to notify outlet members
     * @return {Object} The outlet ID
     */
    toggleDispatch(outlet_id, dispatch_enabled = false, notify = false, trx) {

        return this
            .get(null, hashids.decode(outlet_id), trx)
            .then(outlet => {

                if (outlet.get('dispatch_enabled') === dispatch_enabled) {
                    return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .msg(`This outlet already has dispatch ${outlet.get('dispatch_enabled') ? 'enabled' : 'disabled'}!`)
                    );
                }

                return outlet
                    .save(
                        { dispatch_enabled }, 
                        { patch: true, transacting: trx }
                    )
                    .then(notifyMembers)
                    .catch(e => Promise.reject(ferror.constraint(e)));

                //Notify outlet members
                function notifyMembers(outlet) {
                    return outlet
                        .related('members')
                        .fetch({ transacting: trx })
                        .then(() => {   
                            const recipients = outlet.related('members').models.map(m => m.get('email'))

                            //<a href="${config.SERVER.WEB_ROOT}dispatch">fresconews.com/dispatch</a>
                            const dispatchLink = NotificationController.Mediums.Email.createEmailLink({
                                link: 'dispatch',
                                content: 'fresconews.com/dispatch',
                                referral: {
                                    type: 'email',
                                    email_name: 'dispatch-verified'
                                }
                            });

                            return NotificationController.Mediums.Email
                                .send(recipients, {
                                    title: 'Dispach Enabled',
                                    subject: 'Your outlet has been approved for Fresco Dispatch!',
                                    body: `You now have access to Fresco Dispatch! Visit ${dispatchLink} to start!`,
                                })
                                .then(done)
                                .catch(err => {
                                    reporter.report(err);
                                    done();
                                });
                        })
                        .catch(err => Promise.reject(ferror.constraint(err)));
                }

                function done() {
                    return Promise.resolve({ success: 'ok' });
                }
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }
}

module.exports = new OutletController;
module.exports.Location = require('./Location');
module.exports.Zoho = require('./Zoho');
module.exports.Payment = require('./Payment');
module.exports.Purchase = require('./Purchase');
module.exports.Members = require('./Members');

const AWSController = require('../AWS');
const NotificationController = require('../Notification');
const UserController = require('../User');