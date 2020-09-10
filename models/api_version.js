'use strict';

const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'id',
    'version_major',
    'version_minor',
    'version_patch',
    'is_lts',
    'is_enabled',
    'is_public',
    'deployed_at',
    'deprecated_at'
);

const ApiVersion = module.exports = bookshelf.model('ApiVersion', ...Base({
    tableName: 'api_versions',
    objectName: 'api_version',

    versionString(show_patch = false) {
        let str = String(this.get('version_major')) + '.' + String(this.get('version_minor'));
        if (show_patch) str += '.' + String(this.get('version_patch'));
        return str;
    }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.without('version_patch', 'is_public')
    }
}));