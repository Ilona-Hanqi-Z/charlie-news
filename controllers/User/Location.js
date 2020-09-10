'use strict';

const _ = require('lodash');

const ferror = require('../../lib/frescoerror');
    
const UserLocation = require('../../models/user_location');
const User = require('../../models/user');

class Location {

    find(options = {}, trx) {
        if (!options.geo && !options.assignment_id) {
            return Promise.reject(ferror(ferror.INVALID_REQUEST).msg('One of [geo, assignment_id] must be provided'));
        }

        return UserLocation
            .query(qb => {
                qb.select(
                    'hash',
                    UserLocation.knex.raw('st_asgeojson(user_locations.curr_geo) as geo')
                );

                if (options.geo) {
                    UserLocation.queryGeo(qb, { geoJson: options.geo, radius: options.radius, where: options.where, locationColumn: 'curr_geo' });
                    UserLocation.QUERIES.ACTIVE(qb);
                }

                if (options.assignment_id) {
                    qb.innerJoin('assignment_users', 'assignment_users.user_id', 'user_locations.user_id');
                    qb.where('assignment_users.assignment_id', options.assignment_id);
                }
            })
            .fetchAll({ transacting: trx })
            .then(coll => coll.models.map(m => {
                m.trigger('fetched', m);
                m.set('geo', JSON.parse(m.get('geo')));

                if (options.assignment_id) {
                    m.set('hash', undefined);
                }

                return m;
            }))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Generates report of users. Total and Active based on the passed since
     * @param  {Integer} options.since  The maximum age on the location
     * @return {Promise}
     */
    report({geo, radius, where = 'intersects', since}) { 
        return new Promise((resolve, reject) => {
            let qb = UserLocation.knex('user_locations');

            qb.select(UserLocation.knex.raw('COUNT(*) AS total'));

            if(since) {
                qb.select(
                    UserLocation.knex.raw(`
                        COALESCE(
                            SUM(CASE WHEN curr_timestamp > ? THEN 1 ELSE 0 END),
                            0
                        ) AS active`,
                        [since]
                    )
                );
            }

            UserLocation.queryGeo(qb, { geoJson: geo, radius, where, locationColumn: 'curr_geo' });

            qb
                .then(rows =>  resolve(rows[0]))
                .catch(ferror.constraint(reject));
        });
    }

    /**
     * Performs an upsert to either create or update the location
     * record for the supplied user
     *
     * @param user_model
     * @param lat
     * @param lng
     * @param timestamp
     * @param _trx
     * @returns {Promise}
     */
    update(user_model, { lat, lng, timestamp } = {}, _trx) {
        return new Promise((resolve, reject) => {
            user_model
                .related('location')
                .fetch()
                .then(upsert)
                .catch(ferror.constraint(reject));

            function upsert(loc) {
                if (loc) {
                    loc.save({
                            prev_geo: loc.get('curr_geo'),
                            prev_timestamp: loc.get('curr_timestamp'),
                            curr_geo: {
                                type: 'Point',
                                coordinates: [ lng, lat ]
                            },
                            curr_timestamp: timestamp || new Date()
                        }, { patch: true, transacting: _trx })
                        .then(resolve)
                        .catch(ferror.constraint(reject));
                } else {
                    UserLocation
                        .forge({
                            user_id: user_model.get('id'),
                            curr_geo: {
                                type: 'Point',
                                coordinates: [ lng, lat ]   
                            },
                            curr_timestamp: timestamp || new Date()
                        })
                        .save(null, { method: 'insert', transacting: _trx })
                        .then(resolve)
                        .catch(ferror.constraint(reject));
                }
            }
        });
    }
}

module.exports = new Location;