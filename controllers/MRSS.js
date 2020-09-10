'use strict';

const config = require('../config/index');

const Promise = require('bluebird');
const mime = require('mime');
const moment = require('moment');
const _ = require('lodash');
const querystring = require('query-string');
const xmlescape = require('xml-escape');

const PostController = require('./Post');

const ferror = require('../lib/frescoerror');
const hashids = require('../lib/hashids');

const Post = require('../models/post');

function encode(id) {
    return hashids.encode(parseInt(id, 10));
}

/**
 * MRSS Controller
 * Handles MRSS delivery
 */
class MRSSController {

    /**
     * Formats an MRSS feed for us with a list of posts
     * @param  {Array} posts List of posts to include in the MRSS feed
     * @return {String} String represetnation of the MRSS feed
     */
    format(posts = [], total, req) {
        total = total || posts.length;
        const items = posts.map(post => this.MRSSItemForPost(post, req.query.video_format));
        const rootUrl = config.SERVER.API_ROOT;
        let nextUrl = '', previousUrl = '';

        let pagelessQueryString = _.pick(req.query, ['video_format', 'type', 'user_ids', 'direction', 'limit', 'sortBy']);
        if (Array.isArray(pagelessQueryString.user_ids)) {
            pagelessQueryString.user_ids = pagelessQueryString.user_ids.map(encode);
        }

        let firstUrl = `<atom:link rel="first" href="${rootUrl}mrss?${xmlescape(querystring.stringify(pagelessQueryString, { arrayFormat: 'bracket' }))}" />`;

        if (items.length > 0) {
            if (typeof req.query.page === 'number') {
                pagelessQueryString.page = req.query.page + 1;
                nextUrl = `<atom:link rel="next" href="${rootUrl}mrss?${xmlescape(querystring.stringify(pagelessQueryString, { arrayFormat: 'bracket' }))}" />`;
                if (req.query.page > 1) {
                    pagelessQueryString.page = req.query.page - 1;
                    previousUrl = `<atom:link rel="previous" href="${rootUrl}mrss?${xmlescape(querystring.stringify(pagelessQueryString, { arrayFormat: 'bracket' }))}" />`;
                }

                // clean obj for use below
                delete pagelessQueryString.page;
            } else {
                let lastId = encode(_.last(posts).get('id'));
                pagelessQueryString.last = lastId;
                nextUrl = `<atom:link rel="next" href="${rootUrl}mrss?${xmlescape(querystring.stringify(pagelessQueryString, { arrayFormat: 'bracket' }))}" />`;
                if (req.query.last) {
                    pagelessQueryString.last = posts[0].get('id');
                    pagelessQueryString.direction = (pagelessQueryString.direction === 'asc')
                        ? 'desc'
                        : 'asc';
                    previousUrl = `<atom:link rel="previous" href="${rootUrl}mrss?${xmlescape(querystring.stringify(pagelessQueryString, { arrayFormat: 'bracket' }))}" />`;
                }
            }
        }

        let mrss = `<?xml version="1.0" encoding="UTF-8"?>
            <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:fresco="https://www.fresconews.com/rss">
                <channel>
                    <title>Fresco MRSS Feed</title>
                    <link>${`${config.SERVER.API_ROOT}`}</link>
                    <atom:link rel="self" href="${rootUrl}mrss?${xmlescape(querystring.stringify(req.query, { arrayFormat: 'bracket' }))}" />
                    ${firstUrl}
                    ${nextUrl}
                    ${previousUrl}
                    <description>Fresco MRSS Feed</description>
                    <fresco:itemcount>${total}</fresco:itemcount>
                    ${items.join('')}
                </channel>
            </rss>`;

        return mrss;
    }


    /**
     * Returns an MRSS media item for a post
     * @param  {Object} post Post mode object
     * @param  {String} video_format The format of the video to return (either m3u8 or mp4)
     * @return {String} String representation of the item
     */
    MRSSItemForPost(post, video_format = 'm3u8') {
        let medium = post.get('stream') ? 'video' : 'image';
        let width = post.get('width') || 0;
        let height = post.get('height') || 0;
        let postID = encode(post.id);
        let parent = post.related('parent');
        let url = '';
        let caption = xmlescape(parent.get('caption') || '');

        if (post.has('video')) {
            video_format = video_format.toLowerCase();
            if (video_format === 'm3u8') {
                url = post.get('stream');
            } else if (video_format === 'mp4') {
                url = post.get('video');
            } else {
                throw new Error('Invalid video format');
            }
        } else {
            url = post.get('image');
        }

        if (post.get('index')[1] > 1) {
            caption = `(${post.get('index')[0]}/${post.get('index')[1]}) ` + caption;
        }

        let captionMaxLength = 50;
        let type = mime.lookup(url);
        let name = xmlescape(post.related('owner').name() || '');
        let truncatedCaption = caption.substring(0, captionMaxLength);
        if(caption.length > captionMaxLength) {
            //Truncate until last space so we don't cut off any words and add an ellipsis
            const n = truncatedCaption.lastIndexOf(" ");
            truncatedCaption = truncatedCaption.substring(0, n) + '...';
        }

        let duration = post.get('duration') ? `duration="${post.get('duration')}"` : '';

        return `<item>
            <title>${truncatedCaption}</title>

            <link>${url}</link>

            <description>${caption}</description>

            <guid isPermaLink="false">${postID}</guid>

            <pubDate>${moment(post.get('created_at')).format('ddd, D MMM YYYY hh:mm:ss ZZ')}</pubDate>

            <media:content 
                    ${duration}
                    medium="${medium}" 
                    type="${type}"
                    height="${height}" 
                    width="${width}"
                    url="${url}" />

            <media:credit scheme="urn:yvs:1" role="owner">${name} / Fresco News</media:credit>

            <media:keywords>${parent.has('tags') ? (parent.get('tags').join(', ')) : ''}</media:keywords>

            <media:thumbnail height="${height}" width="${width}" url="${post.get('image')}" />
        </item>`;
    }

}

module.exports = new MRSSController;