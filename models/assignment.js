'use strict';

const _ = require('lodash');
const ferror = require('../lib/frescoerror');
const bookshelf = require('../lib/bookshelf');
const GeoBase = require('./geo_base');
const Columns = require('../lib/columns');
    
const COLUMNS = Columns(
    'id',
    'creator_id',
    'curator_id',
    'title',
    'caption',
    'rating',
    'radius',
    'location',
    'location_buffered',
    'address',
    'starts_at',
    'ends_at',
    'created_at',
    'updated_at',
    'approved_at',
    'curated_at',
    'is_acceptable'
);

const Assignment = bookshelf.model('Assignment', ...GeoBase({
    tableName: 'assignments',
    objectName: 'assignment',

    posts: function() { return this.hasMany('Post', 'assignment_id'); },
    thumbnails: function() { return this.hasMany('Post', 'assignment_id'); },
    outlets: function() { return this.belongsToMany('Outlet', 'assignment_outlets', 'assignment_id', 'outlet_id'); },
    users: function() { return this.belongsToMany('User', 'assignment_users', 'assignment_id', 'user_id'); },

    isActive() {
        let now = new Date();
        return  this.get('rating') == Assignment.RATING.APPROVED &&
                this.has('ends_at') &&
                this.has('starts_at') &&
                new Date(this.get('ends_at')) > now &&
                new Date(this.get('starts_at')) < now
    }
}, {
    GEO_COLUMNS: COLUMNS.with('location', 'location_buffered'),
    COLUMNS: COLUMNS,
    FILTERS: {
        PREVIEW: COLUMNS.with('id', 'title', 'caption', 'address', 'starts_at', 'ends_at'),
        PUBLIC: COLUMNS.without('creator_id', 'location_buffered')
    },

    QUERIES: {
        ACTIVE: (qb, { user, outlet } = {}) => {
            qb.where('assignments.status', Assignment.RATING.APPROVED);
            qb.andWhere('assignments.starts_at', '<=', knex.raw('CURRENT_TIMESTAMP'));
            qb.andWhere('assignments.ends_at', '>', knex.raw('CURRENT_TIMESTAMP'));
            Assignment.QUERIES.BY_OUTLET(qb, { user, outlet });
            return qb;
        },
        EXPIRED: (qb, { user, outlet } = {}) => {
            qb.where('assignments.status', Assignment.RATING.APPROVED);
            qb.andWhere('assignemnts.ends_at', '<=', knex.raw('CURRENT_TIMESTAMP'));
            if (outlet) {
                Assignment.QUERIES.BY_OUTLET(qb, { user, outlet });
            }
            return qb;
        },
        PENDING: (qb, { user, outlet } = {}) => {
            qb.where('assignments.status', Assignment.RATING.UNRATED);
            qb.andWhere('assignments.ends_at', '>', knex.raw('CURRENT_TIMESTAMP'));
            if (outlet) {
                Assignment.QUERIES.BY_OUTLET(qb, { user, outlet });
            }
            return qb;
        },
        BY_OUTLET: (qb, { user, outlet } = {}) => {
            if (!outlet && user && !user.related('outlet').isNew()) outlet = user.related('outlet');
            if (!outlet || outlet.isNew()) return qb;
            return qb.whereExists(function() {
                this.select('*');
                this.from('assignment_outlets');
                this.where('assignment_outlets.assignment_id', Assignment.knex.raw('"assignments"."id"'));
                this.andWhere('assignment_outlets.outlet_id', outlet.get('id'));
            })
        }
    },
    RATING: {
        REJECTED: -1,
        UNRATED: 0,
        APPROVED: 1
    }
}));

module.exports = Assignment;