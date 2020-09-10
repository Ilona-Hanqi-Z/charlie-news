'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'user_id',
    'first_name',
    'last_name',
    'dob_day',
    'dob_month',
    'dob_year',
    'address_line1',
    'address_line2',
    'address_zip',
    'address_city',
    'address_state',
    'document_provided',
    'pid_provided',
    'pid_last4_provided',
    'updated_at',

    'fields_needed',
    'due_by',
    'disabled_reason'
);

const UserIdentity = bookshelf.model('UserIdentity', ...Base({
    tableName: 'user_identities',
	idAttribute: 'user_id',

    user: function() { return this.belongsTo('User', 'user_id'); },

    importAccountData: function(account = {}, trx) {
        return this.save({
            first_name: account.legal_entity.first_name,
            last_name: account.legal_entity.last_name,
            dob_day: account.legal_entity.dob.day,
            dob_month: account.legal_entity.dob.month,
            dob_year: account.legal_entity.dob.year,
            address_line1: account.legal_entity.address.line1,
            address_line2: account.legal_entity.address.line2,
            address_city: account.legal_entity.address.city,
            address_state: account.legal_entity.address.state,
            address_zip: account.legal_entity.address.postal_code,
            pid_last4_provided: account.legal_entity.ssn_last_4_provided,
            pid_provided: account.legal_entity.personal_id_number_provided,
            document_provided: account.legal_entity.verification.status !== 'unverified',
            fields_needed: UserIdentity.FROM_STRIPE_FIELDS(account.verification.fields_needed),
            due_by: account.verification.due_by
                        ? new Date(account.verification.due_by * 1000)
                        : null,
            disabled_reason: account.verification.disabled_reason
        }, {
            patch: true,
            transacting: trx
        })
    }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        SELF: COLUMNS.without('user_id')
    },

    FROM_STRIPE_FIELDS: function(fields = []) {
        if (!_.isArray(fields)) fields = [fields];
        return fields
            .map(UserIdentity.FROM_STRIPE_FIELD)
            .filter(f => f !== '')
    },

    // Translator for stripe's fields_required'
    FROM_STRIPE_FIELD: field => {
        switch (field) {
            case 'legal_entity.first_name':
                return 'first_name'
            case 'legal_entity.last_name':
                return 'last_name'
            case 'legal_entity.dob.day':
                return 'dob_day'
            case 'legal_entity.dob.month':
                return 'dob_month'
            case 'legal_entity.dob.year':
                return 'dob_year'
            case 'legal_entity.address.line1':
                return 'address_line1'
            case 'legal_entity.address.line2':
                return 'address_line2'
            case 'legal_entity.address.city':
                return 'address_city'
            case 'legal_entity.address.state':
                return 'address_state'
            case 'legal_entity.address.postal_code':
                return 'address_zip'
            case 'legal_entity.ssn_last_4':
                return 'pid_last4'
            case 'legal_entity.verification.document':
                return 'id_document'
            case 'legal_entity.personal_id_number':
                return 'personal_id_number'
            default:
                return ''
        }
    },
    // Generates a stripe.account update object out of a local user identity update object
    BUILD_STRIPE_UPDATES: (id_updates = {}) => {
        let stripe_updates = { legal_entity: {} }
        for (let key in id_updates) {
            switch (key) {
                case 'first_name':
                    stripe_updates.legal_entity.first_name = id_updates[key]
                    break
                case 'last_name':
                    stripe_updates.legal_entity.last_name = id_updates[key]
                    break
                case 'id_document':
                case 'stripe_document_token':
                    stripe_updates.legal_entity.verification = { document: id_updates[key] }
                    break
                case 'pid_last4':
                    stripe_updates.legal_entity.ssn_last_4 = id_updates[key]
                    break
                case 'personal_id_number':
                case 'stripe_pid_token':
                    stripe_updates.legal_entity.personal_id_number = id_updates[key]
                    break
                case 'dob_day':
                case 'dob_month':
                case 'dob_year':
                    if (!stripe_updates.legal_entity.dob) stripe_updates.legal_entity.dob = {}
                    if (key === 'dob_day') stripe_updates.legal_entity.dob.day = id_updates[key]
                    if (key === 'dob_month') stripe_updates.legal_entity.dob.month = id_updates[key]
                    if (key === 'dob_year') stripe_updates.legal_entity.dob.year = id_updates[key]
                    break
                case 'address_line1':
                case 'address_line2':
                case 'address_city':
                case 'address_state':
                case 'address_zip':
                    if (!stripe_updates.legal_entity.address) stripe_updates.legal_entity.address = {}
                    if (key === 'address_line1') stripe_updates.legal_entity.address.line1 = id_updates[key]
                    if (key === 'address_line2') stripe_updates.legal_entity.address.line2 = id_updates[key]
                    if (key === 'address_city') stripe_updates.legal_entity.address.city = id_updates[key]
                    if (key === 'address_state') stripe_updates.legal_entity.address.state = id_updates[key]
                    if (key === 'address_zip') stripe_updates.legal_entity.address.postal_code = id_updates[key]
                    break
                default:
                    break
            }
        }
        return stripe_updates
    }
}));

module.exports = UserIdentity;