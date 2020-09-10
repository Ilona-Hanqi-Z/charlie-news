'use strict';

const middleware = require('../../middleware');
const express = require('express');
const router = express.Router();

const MRSSController = require('../../controllers/MRSS');
const PostController = require('../../controllers/Post');

const needs = require('../../lib/needs');

router.get('/',
    middleware.hashIds,
    middleware.auth.permissions({
        client: 'mrss:mrss:get'
    }),
    needs.querystring({
        type_: [ 'video', 'photo' ],
        video_format_: [ 'm3u8', 'mp4' ],
        user_ids_: 'int[]',
        tags_: 'str[]'
    }).including(needs.pagination),
    (req, res, next) => {
        PostController
            .mrss(req.query, res.locals)
            .then(result => 
                PostController
                    .build(result.posts, Object.assign({
                        keep_fields: ['index'],
                        show_parent: true,
                        show_owner: true
                    }, res.locals))
                    .then(posts => 
                        Promise.resolve({
                            posts,
                            totalCount: result.totalCount
                        })
                    )
            )
            .then(({ posts, totalCount }) => MRSSController.format(posts, totalCount, req))
            .then(mrss => {
                res.contentType("application/rss+xml");
                res.send(mrss);
            })
            .catch(next);
    }
);


module.exports = router;