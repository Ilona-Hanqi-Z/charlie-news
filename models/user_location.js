'use strict';

const _ = require('lodash');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
const GeoBase = require('./geo_base');
const constants = require('../lib/constants');
    
const COLUMNS = Columns(
    'user_id',
    'hash',
    'curr_geo',
    'curr_timestamp',
    'prev_geo',
    'prev_timestamp'
);

module.exports = bookshelf.model('UserLocation', ...GeoBase({
    tableName: 'user_locations',
    idAttribute: 'user_id',
    objectName: 'user_location',

    serialize: function(options) {
        (options = _.isObject(options) ? options : {}).omitPivot = true;
        return bookshelf.Model.prototype.serialize.call(this, options);
    },

    user: function() { return this.belongsTo('User', 'user_id'); },

    /**
     * Returns the distance of this location from a geojson object
     * @param target {GeoJSON} The target to calculate the distance to.
     * @returns {Promise<Number>} The distance in miles the user is from the target object, or -1 if the user doesn't have a location
     */
    distanceTo: function(target) {
        return this
            .query(qb => {
                qb.select(bookshelf.knex.raw(
                    `ST_Distance(ST_geomFromGeoJSON(?)::geography, ST_geomFromGeoJSON(?)::geography) / ${constants.METERS_PER_MILE} AS distance_miles`,
                    [this.get('curr_geo'), target]
                ));
            })
            .fetch({ require: true })
            .then(model => model.get('distance_miles'));
    }
}, {
    GEO_COLUMNS: COLUMNS.with('curr_geo', 'prev_geo'),
    COLUMNS: COLUMNS,
    QUERIES: {
        ACTIVE: (qb) => {
            //Only show results from the last 24 hours
            return qb.where('curr_timestamp', '>', new Date(Date.now() - 1210000000).toISOString())
        }
    },
    FILTERS: {
        SAFE: COLUMNS.without('user_id', 'prev_geo', 'prev_timestamp'),
        SELF: COLUMNS.without('hash', 'prev_geo', 'prev_timestamp'),
        CURRENT: COLUMNS.without('user_id', 'prev_geo', 'prev_timestamp'),
        PREVIOUS: COLUMNS.without('user_id', 'curr_geo', 'curr_timestamp')
    }
}));