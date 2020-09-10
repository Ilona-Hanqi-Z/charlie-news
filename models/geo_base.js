const _ = require('lodash');
const base_model = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
const constants = require('../lib/constants');

module.exports = (base, proto) => {
    if (!proto.GEO_COLUMNS || !proto.GEO_COLUMNS.length) throw new Error('Missing prototype.GEO_COLUMNS');

    base_model(base, proto);
    
    // If there are any filters, replace the geo columns with to-geoJSON conversions
    if (proto.FILTERS) {
        proto.GEO_FILTERS = {};
        for (let i in proto.FILTERS) {
            proto.GEO_FILTERS[i] = Columns(...proto.FILTERS[i]);
            for (let col of proto.GEO_FILTERS[i]) {
                let k = proto.GEO_FILTERS[i].indexOf(col);
                let j = proto.GEO_COLUMNS.indexOf(col);
                if (j >= 0) {
                    proto.GEO_FILTERS[i][k] = bookshelf.knex.raw('ST_asGeoJSON(??.??) AS ??', [base.tableName, col, col]);
                } else {
                    proto.GEO_FILTERS[i][k] = bookshelf.knex.raw(`${base.tableName}.${col}`);
                }
            }
        }
    }

    /**
     * Allows querying against the geospatial data on this model
     * 
     * @param {knex.QueryBuilder} qb
     * @param {object} options
     * @param {string} [options.where=intersects] the type of query to apply
     *                                              `intersects` = select geometries which intersect the geo query
     *                                              `within` = select geometries which are within `radius` meters of the geo query
     *                                              `contains` = select geometries which completely contain the geo query
     *                                              `contained` = select geometries which are completely contained by the geo query
     * @param {knex.QueryBuilder} [options.geoRaw] a raw querybuilder returning a geography with which to query 
     * @param {GeoJSON} [options.geoJson] a geojson representation of the geography query
     * @param {(number|knex.QueryBuilder)} [options.radius] the radius with which to apply to the queried geography
     *                                  note that if the query doesn't take a radius (i.e. Intersects)
     *                                  that the radius will be applied as a buffer to the queried geography
     * @param {string} [locationColumn=location] the column to use on this model for geospatial querying (exclude table name)
     * @param {boolean} [withNulls=false] if true, include null results in query 
     */
    proto.queryGeo = function(qb, { where = 'intersects', geoRaw, geoJson, radius, radiusRaw, locationColumn = 'location', withNulls = false } = {}) {
        if (!locationColumn.includes('.')) {
            locationColumn = base.tableName + '.' + locationColumn;
        }

        if (!radiusRaw && radius && radius > 0) {
            radiusRaw = bookshelf.knex.raw('?', [radius]);
        } else if (!radiusRaw && where === 'within') {
            throw 'You must specify a radius or radiusRaw when performing a `within` operation in GeoBase#queryGeo'
        }

        if (!geoRaw && geoJson) {
            geoRaw = bookshelf.knex.raw('ST_geomFromGeoJSON(?)::GEOGRAPHY', [JSON.stringify(geoJson)]);
        } else if (!geoRaw) {
            throw 'You must specify a geospatial query in GeoBase#queryGeo';
        }


        qb.where(function() {
            if (where === 'within') {
                this.whereRaw(`ST_DWithin(?, ??, ?)`, [geoRaw, locationColumn, radiusRaw]);
            } else if (where === 'coveredby') {
                // TODO We should probably figure out a better way to specify what the radius applies to
                this.whereRaw('ST_CoveredBy(?, ST_Buffer(??, ?))', [geoRaw, locationColumn, radiusRaw]);
            } else {
                if (radiusRaw) {
                    geoRaw = bookshelf.knex.raw('ST_Buffer(?, ?)', [geoRaw, radiusRaw]);
                }
                
                if (where === 'intersects') {
                    this.whereRaw('ST_Intersects(?, ??)', [geoRaw, locationColumn]);
                } else if (where === 'contains') {
                    this.whereRaw('ST_Contains(?::GEOMETRY, ??::GEOMETRY)', [geoRaw, locationColumn]);
                } else if (where === 'contained') {
                    this.whereRaw('ST_Contains(??::GEOMETRY, ?::GEOMETRY)', [locationColumn, geoRaw]);
                } else {
                    throw 'Invalid geospatial operation: ' + where;
                }
            }

            if (withNulls > 0) {
                this.orWhereNull(locationColumn);
            }
        });

        return qb;
    };
    
    if (base.initialize) base._geo_init = base.initialize;
    
    base.fetchingGeo = function(model, cols, options) {
        let columns = [];
        let onQuery = false; // Flag used to determine if the changes should be applied to the query itself, or the column arguments
        
        if (options.columns) columns = options.columns; // TODO correctly handle this case
        else if (cols) columns = cols;
        else onQuery = true;

        if (columns.length === 0 || columns.includes('*') || columns.includes(`${base.tableName}.*`)) columns = proto.GEO_COLUMNS;
        else columns = _.intersection(proto.GEO_COLUMNS, columns);

        columns.forEach(col => {
            if (columns.constructor.name === 'Raw') return;
            let q = bookshelf.knex.raw('ST_asGeoJSON(??.??) AS ??', [ this.tableName, col, col ]);
            
            if (onQuery) options.query.select(q);
            else (options.columns || cols).push(q);
        });
    };

    base.creatingGeo = function(model, attrs, options) {
        for (let col of proto.GEO_COLUMNS) {
            if (model.attributes[col]) {
                let geo = model.attributes[col];

                if(geo === null) {
                    model.set(col, bookshelf.knex.raw('NULL'));
                    continue;
                }

                if (typeof geo !== 'string') geo = JSON.stringify(geo);
                let raw_geo = bookshelf.knex.raw('ST_geomFromGeoJSON(?)', [ model.attributes[col] ]);
                raw_geo.__geo = typeof model.attributes[col] === 'string' ? JSON.parse(model.attributes[col]) : model.attributes[col];
                model.set(col, raw_geo);
            }
        }
    };
    
    base.updatingGeo = function(model, attrs, options) {
        for (let col of proto.GEO_COLUMNS) {
            if (attrs[col]) {

                if(attrs[col] == 'null') {
                    attrs[col] = bookshelf.knex.raw('NULL');
                    continue;
                }

                if (typeof attrs[col] !== 'string') attrs[col] = JSON.stringify(attrs[col]);
                attrs[col] = bookshelf.knex.raw('ST_geomFromGeoJSON(?)', [ attrs[col] ]);
            }
        }
    };

    base.savedGeo = function(model, attrs, options) {
        if (options.patch) return
        for (let index of [ 'changed', 'attributes' ]) {
            for (let col of proto.GEO_COLUMNS) {
                // TODO better way to check? (i.e. instanceof)
                if (model[index][col]) {
                    switch (model[index][col].constructor.name) {
                        case 'Raw':
                            model[index][col] = model[index][col].__geo;
                            break;
                        case 'String':
                            model[index][col] = JSON.parse(model[index][col]);
                            break;
                        default:
                            break;
                    }
                }
            }
        }
    };
    base.fetchedGeo = function(model, response, options) {
        if (!model) return;
        for (let col of proto.GEO_COLUMNS) {
            try { // TODO this should not be in a try/catch.  This should NEVER EVER happen if code is properly written
                  // Left in block due to unknown possible repercussions
                if (model.has(col) && _.isString(model.get(col))) {
                    model.set(col, JSON.parse(model.get(col)));
                }
            } catch (e) {
                continue;
            }
        }
    };

    base.initialize = function() {
        this.on('fetching', this.fetchingGeo);
        this.on('creating', this.creatingGeo);
        this.on('updating', this.updatingGeo);
        this.on('fetched', this.fetchedGeo);
        this.on('saved', this.savedGeo);
        if (base._geo_init) base._geo_init.call(this);
    };

    return [base, proto];
};