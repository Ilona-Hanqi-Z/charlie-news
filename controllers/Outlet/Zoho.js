'use strict';

const config = require('../../config');

const _ = require('lodash');
const request = require('superagent');
const Promise = require('bluebird');

const ferror = require('../../lib/frescoerror');
const hashids = require('../../lib/hashids');

const Outlet = require('../../models/outlet');
const User = require('../../models/user');

class ZohoController {

    /**
     * Processes incoming Zoho webhooks
     * 
     * @param body {Object} Zoho request body
     * @param trx {Transaction}
     * 
     * @returns {Promise}
     */
    webhook(body = {}, { trx } = {}) {
        switch (body.event) {
            case 'verify_outlet':
                return OutletController.verify(body.outlet, true, trx)
            case 'toggle_dispatch':
                return OutletController.toggleDispatch(body.outlet, body.enabled, true, trx)
            default:
                return Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Invalid event type').param('type'));
        }
    }

    /**
     * Creates ZOHO lead with a given outlet model      
     * @param  {Object} outlet Bookshelf outlet model
     * @return {[type]}        [description]
     */
    createZohoLead(user_model, outlet, type = '', state = '', source='') {
        return new Promise((resolve, reject) => {
            const full_name = user_model.has('full_name')
                                    ? user_model.get('full_name')
                                    : '';
            const index = full_name.indexOf(' ') || 0;
            const firstname = full_name.substr(0, index > 0 ? index : full_name.length);
            const lastname = full_name.substr(index > 0 ? index + 1 : full_name.length) || 'Unknown'; // ZOHO requires a last name

            const zohoLead =  `<Leads>
                <row no="1">
                    <FL val="Lead Source">${source || 'Platform Sign Up'}</FL>
                    <FL val="Company">${outlet.get('title')}</FL>
                    <FL val="Lead Name">${outlet.get('title')}</FL>
                    <FL val="Fresco Outlet ID">${hashids.encode(outlet.get('id'))}</FL>
                    <FL val="Fresco User ID">${hashids.encode(user_model.get('id'))}</FL>
                    <FL val="Email">${user_model.get('email')}</FL>
                    <FL val="First Name">${firstname}</FL>
                    <FL val="Last Name">${lastname}</FL>
                    <FL val="Website">${outlet.get('link')}</FL>
                    <FL val="Phone">${user_model.get('phone') || ''}</FL>
                    <FL val="Lead Type">${type}</FL>
                    <FL val="State">${state}</FL>
                </row>
            </Leads>`;

            request
                .post(`${config.ZOHO.CREATE_LEAD}&xmlData=${(zohoLead)}`)
                .end((err, response) => {
                    if(err) {
                        return reject(ferror(ferror.INVALID_REQUEST).msg('Could not reach ZOHO API!'))
                    } else if(response.text.indexOf('Record(s) added successfully') == -1) {
                        return reject(ferror(ferror.INVALID_REQUEST).msg('Failed to create ZOHO lead!'))
                    }
                    
                    resolve(outlet);
                });
        });
    }
}

const OutletController = require('../../controllers/Outlet');

module.exports = new ZohoController