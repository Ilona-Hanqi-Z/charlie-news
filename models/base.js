const _ = require('lodash');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

module.exports = (base, proto) => {
    if (base.initialize) base._base_init = base.initialize;

    // Only return columns on this model
    base.__returning = function(model, attrs, options) {
        if (!options.returning) return;
        _.difference(proto.COLUMNS, options.returning).forEach(col => {
            model.unset(col);
        });
    };
    
    // When saving, delete any parameters that are not columns on the table
    base.__trim_params = function(model, attrs = {}, options) {
        if (!_.isEmpty(attrs)) {
            _.difference(Object.keys(attrs), proto.COLUMNS).forEach(key => {
                delete attrs[key];
            });
        }
        if (!options.patch && model) {
            _.difference(Object.keys(model.attributes), proto.COLUMNS).forEach(key => {
                model.unset(key);
            });
        }
    };
    
    base.toJSON = function(options = {}) {
        if (this.isNull()) return null;
        let json = bookshelf.Model.prototype.serialize.call(this, options);
        if (this.objectName) json.object = this.objectName;
        return json;
    },

    /**
     * Generates a model that, when empty, will return null when
     * toJSON is invoked and the model has no attributes.
     */
    proto.nullable = function() {
        let model = this.forge(...arguments);
        model.__nullable = true;
        return model;
    };

    // Checks if this model is null (must also be nullable)
    base.isNull = function() {
        return this.__nullable === true && Object.keys(this.attributes).length === 0;
    };

    // Checks if this model has no attributes
    base.isEmpty = function() {
        return Object.keys(this.attributes).length === 0;
    };

    // Filters the model to only have the provided columns
    base.columns = function(columns) {
        _.difference(Object.keys(this.attributes), columns).forEach(col => {
            this.unset(col);
        });
        return this;
    };

    // For initializing the model by attaching functions and calling base initialize
    base.initialize = function() {
        this.on('saving', this.__trim_params);
        this.on('saved', this.__returning);
        if (base._base_init) base._base_init.call(this);
    };

    // Provides pagination functionality on querybuilder
    proto.paginate = function(qb, { sortBy = 'id', direction = 'desc', limit, last, page, coalesce } = {}) {
        if (!qb) return;

        if (page) {
            limit = limit || 10;
            qb.offset((page - 1) * limit);
        } else if (last) {
            if (sortBy === 'id') {
                qb.where(`${base.tableName}.id`, direction == 'desc' ? '<' : '>', last);
            } else {
                qb.where(`${base.tableName}.id`, '!=', last);
                if (coalesce) {
                    qb.whereRaw(
                        `COALESCE(??, ??) ${ direction == 'desc' ? '<' : '>' } (SELECT COALESCE(??, ??) FROM ?? WHERE id = ?)`,
                        [`${base.tableName}.${sortBy}`, `${base.tableName}.${coalesce}`, sortBy, coalesce, base.tableName, last]
                    );
                }
                else {
                    qb.whereRaw(
                        `?? ${ direction == 'desc' ? '<' : '>' } (SELECT ?? FROM ?? WHERE id = ?)`,
                        [`${base.tableName}.${sortBy}`, sortBy, base.tableName, last]
                    );
                }
            }
        }

        if (coalesce) {
            qb.orderByRaw(`COALESCE(??, ??) ${direction} NULLS LAST`, [`${base.tableName}.${sortBy}`, `${base.tableName}.${coalesce}`]);
        }
        else {
            qb.orderByRaw(`?? ${direction} NULLS LAST`, `${base.tableName}.${sortBy}`);
        }

        if (limit) qb.limit(limit);
    };

    proto.disambiguate = function(columns) {
        return columns.map(column => `${base.tableName}.${column}`)
    };

    proto.COLUMNS = proto.COLUMNS || Columns(); // Columns of this model
    proto.QUERIES = proto.QUERIES || {}; // Various special queries for this model
    proto.FILTERS = proto.FILTERS || {}; // Various filters for this model
    proto.bookshelf = bookshelf; // Bookshelf object
    proto.knex = bookshelf.knex; // Knex object
    proto.Collection = bookshelf.Collection;

    proto.FILTERS.ALL = proto.COLUMNS

    return [base, proto];
};