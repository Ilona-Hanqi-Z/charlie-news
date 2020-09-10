'use strict';

const _ = require('lodash');
const bcrypt = require('bcryptjs');
const Promise = require('bluebird');

Promise.promisifyAll(bcrypt);

const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
const ferror = require('../lib/frescoerror');
const constants = require('../lib/constants');

const knex = bookshelf.knex;

const COLUMNS = Columns(
    'id',
    'outlet_id',
    'email',
    'password',
    'username',
    'full_name',
    'bio',
    'location',
    'radius',
    'phone',
    'avatar',
    'twitter_handle',
    'terms',
    'verification_token',
    'reset_token',
    'created_at',
    'expires_at',
    'suspended_until',
    'offense_count',

    // Stripe info
    'stripe_account_id',
    'stripe_secret_key',
    'stripe_public_key',

    'charges_enabled',
    'transfers_enabled',
    'knows_cant_transfer'
);

const User =  bookshelf.model('User', ...Base({
    tableName: 'users',
    objectName: 'user',

    initialize: function() {
        this.on('saving', this.hashPassword);
    },

    // Relations
    active_payment: function() { return this.hasOne('UserPayment', 'user_id').where('active', true); },
    blocked_users: function() { return this.belongsToMany('User', 'user_blocks', 'blocking_user_id', 'blocked_user_id'); },
    followed_users: function() { return this.belongsToMany('User', 'following_users', 'user_id', 'other_id'); },
    followers: function() { return this.belongsToMany('User', 'following_users', 'other_id', 'user_id'); },
    galleries: function() { return this.hasMany('Gallery', 'owner_id'); },
    gallery_reposts: function() { return this.hasMany('GalleryRepost', 'user_id'); },
    identity: function() { return this.hasOne('UserIdentity', 'user_id'); },
    installations: function() { return this.hasMany('Installation', 'user_id'); },
    location: function() { return this.hasOne('UserLocation', 'user_id'); },
    outlet: function() { return this.belongsTo('Outlet', 'outlet_id'); },
    payment_methods: function() { return this.hasMany('UserPayment', 'user_id'); },
    purchases: function() { return this.hasMany('Purchase', 'user_id'); },
    roles: function() { return this.belongsToMany('Role', 'user_roles', 'user_id', 'role_id'); },
    settings: function() { return this.hasMany('UserSettings', 'user_id'); },
    social_links: function() { return this.hasMany('SocialLink', 'user_id'); },
    story_reposts: function() { return this.hasMany('StoryRepost', 'user_id'); },

    /**
     * Checks if this user has the permissions described by the given scope(s)
     * 
     * @param {string} scope admin, user, outlet, etc.
     * @param {string} verb create, delete, get, update
     * @param {string} noun user, assignment, gallery, etc.
     * 
     * @returns {boolean}
     */
    can: function(scope, verb, noun) {
        return auth.checkPermission(`${scope}:${noun}:${verb}`, auth.scopesToRegex(this.scopes()));
    },

    /**
     * Fetch this user's settings
     *
     * @param filter {String[]}
     * @param type {String} key of setting to fetch
     * @param types {String[]} keys of the settings to fetch
     * @param types_like {String} postgresql LIKE query for fetching settings by key
     * @returns {Promise}
     */
    fetchSettings: function({ filter = UserSettings.FILTERS.FULL, include_meta = false, type, types, types_like } = {}, trx) {
        return UserSettings
            .query(qb => {
                // TODO was there a reason for getting setting_times.X here?
                qb.select(filter.map(s => `user_settings.${s}`));
                qb.where('user_settings.user_id', this.get('id'));

                if (include_meta) {
                    qb.select('setting_types.description', 'setting_types.title');
                    qb.innerJoin('setting_types', 'user_settings.type', 'setting_types.type');
                }

                if (type) {
                    qb.where('user_settings.type', type);
                } else if (types) {
                    qb.whereIn('user_settings.type', types);
                } else if (types_like) {
                    qb.where('user_settings.type', 'LIKE', types_like);
                }

                qb.orderBy('user_settings.type', 'desc');
            })
            .fetchAll({ transacting: trx })
            .then(settings_coll => {
                this.relations.settings = settings_coll;
                return settings_coll;
            });
    },

    /**
     * Retrieves a name for the user depending on if they have a full_name set
     * @return {String} Name for the user
     */
    name: function(){
        if(this.get('full_name') == null || this.get('full_name') === '') {
            return this.get('username');
        } else {
            return this.get('full_name');
        }
    },

    isSuspended: function() {
        return !(this.get('suspended_until') == null || this.get('suspended_until') < new Date());
    },

    hashPassword: function(model, attrs, options) {
        if (!attrs.password && !(model.has('password') && model.hasChanged('password'))) {
            return Promise.resolve();
        }

        let pass = attrs.password || model.get('password');

        return bcrypt
            .genSaltAsync(10)
            .then(salt => bcrypt.hashAsync(pass, salt))
            .then(hash => {
                if (attrs.password) attrs.password = hash;
                model.set('password', hash);
                return Promise.resolve(hash);
            })
            .catch(err =>
                Promise.reject(ferror(err).type(ferror.API).msg('Error generating password hash'))
            )
    },

    /**
     * Returns the scopes a user has, based on its roles
     * 
     * @returns {string[]}
     */
    scopes: function() {
        let scopes = [];
        for (let role of this.related('roles').models) {
            scopes = scopes.concat(role.get('scopes'));
        }
        return scopes;
    }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        SAFE: COLUMNS.without('stripe_secret_key', 'password', 'expires_at', 'verification_token', 'reset_token'),
        SELF: COLUMNS.without('stripe_account_id', 'stripe_secret_key', 'stripe_public_key', 'verification_token', 'reset_token', 'password', 'expires_at', 'knows_cant_transfer'),
        PUBLIC: COLUMNS.with('id', 'username', 'location', 'full_name', 'twitter_handle', 'bio', 'avatar', 'created_at', 'suspended_until'),
        ADMIN: COLUMNS.with('id', 'username', 'location', 'full_name', 'twitter_handle', 'bio', 'avatar', 'created_at', 'email', 'suspended_until', 'stripe_account_id'),
        PREVIEW: COLUMNS.with('id', 'username', 'full_name', 'avatar')
    },
    QUERIES: {
        ACTIVE: qb => {
            return qb.whereNull('users.expires_at', true);
        },
        NOT_BLOCKED: (qb, { user, column = 'users.id' } = {}) => {
            if (!user) return qb;
            return qb.whereRaw('CASE WHEN ?? IS NULL THEN TRUE ELSE ?? NOT IN (SELECT blocked_user_id FROM user_blocks WHERE blocking_user_id = ?) END', [column, column, user.get('id')]);
        },
        NOT_BLOCKING: (qb, { user, column = 'users.id' } = {}) => {
            if (!user) return qb;
            return qb.whereRaw('CASE WHEN ?? IS NULL THEN TRUE ELSE ?? NOT IN (SELECT blocking_user_id FROM user_blocks WHERE blocked_user_id = ?) END', [column, column, user.get('id')]);
        },
        BLOCKING_FILTER: (qb, { user, column = 'users.id' } = {}) => {
            User.QUERIES.NOT_BLOCKED(qb, { user, column });
            return User.QUERIES.NOT_BLOCKING(qb, { user, column });
        },
        FOLLOWED: (qb, { user } = {}) => {
            User.QUERIES.ACTIVE(qb);
            if (!user) return qb;
            return qb.select(knex.raw(
                '(SELECT CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END FROM ?? WHERE ?? = ? AND ?? = "users"."id") AS ??',
                ['following_users', 'following_users.user_id', user.get('id'), 'following_users.other_id', 'following']
            ));
        },
        STATS: qb => {
            qb.select(knex.raw(`(SELECT COUNT(*) from posts where owner_id = users.id AND stream IS NOT NULL) AS videos`));
            return qb.select(knex.raw(`(SELECT COUNT(*) from posts where owner_id = users.id AND stream IS NULL) AS photos`));
        },
        GEO_NEAR: (qb, { geo, radius } = {}) => {
            qb.innerJoin('user_locations', 'user_locations.user_id', 'users.id');
            qb.where('user_locations.current_timestamp', '>', knex.raw("CURRENT_TIMESTAMP - INTERVAL '1 day'"));
            if (radius) {
                qb.whereRaw('ST_Intersects(user_locations.current_geo, ST_geomFromGeoJSON(?))', [JSON.stringify(geo)]);
            } else {
                qb.whereRaw('ST_Intersects(user_locations.current_geo, ST_Buffer(ST_geomFromGeoJSON(?), ?))', [JSON.stringify(geo), radius * 0.00621371]);
            }
            return qb;
        }
    },
    TOKEN_TYPES: {
        REGISTER: Symbol('registration'),
        RESET_PASSWORD: Symbol('pwreset')
    }
}));

module.exports = User;

// Models required below export to avoid circular references
const Outlet = require('./outlet');
const Role = require('./role');
const Story = require('./story');
const UserSettings = require('./user_settings');

// Lib required below export to avoid circular references
const auth = require('../lib/auth');
