'use strict';

const config = require('../config');
const Promise = require('bluebird');
const scheduler = require('../lib/scheduler');

module.exports = function() {
    return Promise.all([
        checkOutletActivitySchedule()
    ])
};

// inits a general schedule used for events that run once per day
function checkOutletActivitySchedule() {
    return scheduler
        .get(config.SCHEDULER.slugs.general.daily, '*')
        .then(schedule => {
            if (schedule) {
                return schedule;
            } else {
                let run_at = new Date()
                run_at.setDate(run_at.getDate() + 1);
                run_at.setHours(0,0,0,0);

                return scheduler.add(config.SCHEDULER.slugs.general.daily, '*', {
                    run_at,
                    request: {
                        href: config.SERVER.API_ROOT + scheduler.paths.general.daily,
                        headers: {
                            Authorization: 'Basic ' + config.SCHEDULER.client_credentials_base64
                        },
                        method: 'post'
                    },
                    recurring: {
                        days: 1
                    }
                });
            }
        })
        .catch(console.error);
}