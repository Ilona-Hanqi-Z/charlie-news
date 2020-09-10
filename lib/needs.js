const _ = require('lodash');
const constants = require('./constants');
const ferror = require('./frescoerror');
const hashids = require('./hashids');
const needs = require('needs-params');
const Post = require('../models/post');

module.exports = needs({ strict: true });
module.exports.error = needs.error;

let map = {
    'parent': 'parent_id',
    'owner': 'owner_id',
    'curator': 'curator_id',
    'date': 'created_at',
    'created_at': 'created_at',
    'captured_at': 'captured_at'
};
module.exports.pagination = module.exports.querystring({
    last_: last => hashids.decode(last) || last,
    page_: 'int',
    direction_: ['asc', 'desc'],
    sortBy_: sort => map[sort] || sort,
    limit_: limit => {
        limit = parseInt(limit)
        if (isNaN(limit) || limit > 100) {
            return new needs.error('Invalid pagination limit')
        }
        return limit
    }
});

module.exports.id = val => hashids.decode(val) || new Error('Invalid ID string');
module.exports.id_or_str = [[module.exports.id , 'str']];

module.exports.spat_id = module.exports.spat({
    id_: 'int'
});
module.exports.spat_ids = module.exports.spat({
    ids_: 'int[]'
});

module.exports.tags = tags => {
    if (!Array.isArray(tags)) tags = [tags];
    let regex = new RegExp('[^a-zA-Z0-9\d:]');
    for (let i = tags.length - 1; i >= 0; --i) {
        if (!tags[i] || tags[i].length > 24 || regex.test(tags[i])) {
            return new needs.error('Invalid tags')
        }
    }
    return tags;
}

module.exports.miles_to_meters = (miles, max, min) => {
    miles = parseFloat(miles);
    if (isNaN(miles)) {
        return new needs.error('Invalid distance')
    } else if (max != null && miles > max) {
        return new needs.error('Invalid distance: Too large!')
    } else if (min != null && miles > max) {
        return new needs.error('Invalid distance: Too small!')
    }
    return parseInt(miles * constants.METERS_PER_MILE, 10);
}

module.exports.articles = a => {
    if (!_.isArray(a)) return;
    if (a.some(aa => (!aa.link))) return new needs.error('Missing required field: link');
    return a.map(aa => ({
        title: aa.title,
        link: aa.link,
        favicon: aa.favicon
    }));
};
module.exports.stories = a => {
    if (!_.isArray(a)) return;
    if (a.some(aa => !aa.title)) return new needs.error('Missing required field: title');
    return a.map(aa => ({
        title: aa.title,
        caption: aa.caption
    }));
};

module.exports.posts_new = a => {
    if (!_.isArray(a)) return;
    if (a.some(aa => !aa.contentType)) return new needs.error('Missing required field: contentType');
    return a.map(aa => ({
        outlet_id: aa.outlet_id,
        assignment_id: aa.assignment_id,
        rating: aa.rating,
        address: aa.address,
        lat: aa.lat,
        lng: aa.lng,
        contentType: aa.contentType,
        chunkSize: aa.chunkSize,
        fileSize: aa.fileSize,
        assignment_id: aa.assignment_id,
        captured_at: aa.captured_at
    }));
}
module.exports.posts_update = a => {
    if (!_.isArray(a)) return;
    let objs = [];
    for (let i = a.length - 1; i >= 0; --i) {
        if (!a[i].id) return new needs.error('Missing required field: post_id');

        // Special case assignment_id, it's allowed to be null
        if (!(a[i].lat || a[i].lng || a[i].address || a[i].rating || a[i].assignment_id !== undefined)) return new needs.error('No updates provided for post');

        let _obj = {
            id: a[i].id,
            address: a[i].address,
            rating: a[i].rating,
            assignment_id: a[i].assignment_id
        };

        if (_obj.rating && (_obj.rating < Post.RATING.UNRATED || _obj.rating > Post.RATING.VERIFIED)) {
            return new needs.error(`Invalid post rating ${_obj.rating}`)
        }
        else {
            delete _obj.rating;
        }

        if (a[i].lat && a[i].lng) {
            _obj.location = {
                type: 'Point',
                coordinates: [parseFloat(a[i].lng), parseFloat(a[i].lat)]
            };
        }
        
        objs.push(_obj);
    }
    return objs;
};

module.exports.geoJSON = {
    type: ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'],
    coordinates: function checkCoords(coords) {
        for (let i in coords) {
            if (!isNaN(coords[i])) {
                coords[i] = parseFloat(coords[i]);
            } else if (Array.isArray(coords[i])) {
                if (!checkCoords(coords[i])) return new needs.error('Invalid geoJSON');
            } else {
                return new needs.error('Invalid geoJSON');
            }
        }
        return coords;
    }
};