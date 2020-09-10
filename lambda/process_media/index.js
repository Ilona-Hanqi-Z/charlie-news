'use strict';

const AWS = require('aws-sdk');
const gm = require('gm').subClass({ imageMagick: true });
const mime = require('mime')
const superagent = require('superagent');

const S3 = new AWS.S3();
const ElasticTranscoder = new AWS.ElasticTranscoder({ region: 'us-east-1' });

let pipelineId;
let FRESCO_ENDPOINT, BASIC_AUTH;

if (process.env.Environment === 'Development') {
    pipelineId = '1471562309174-k7g6hx';
    FRESCO_ENDPOINT = 'https://api.dev.fresconews.com/v2/';
    BASIC_AUTH = 'Basic aEN4ZkZNc0JEeGE5NDVlSDpNZXpBVlh4Y3NxUFNDVmplcUc4cUo4RkZ2TkRGd1l0UA==';
} else if (process.env.Environment === 'Production') {
    pipelineId = '1477088804346-xh6dbf';
    FRESCO_ENDPOINT = 'https://api.fresconews.com/v2/';
    BASIC_AUTH = 'Basic aEN4ZkZNc0JEeGE5NDVlSDphMVhJYlA0QXpYdnR5R1A1N0h0WDVld0E4RHpDdlVlag==';
} else if (process.env.Environment === 'Staging') {
    throw new Error('Environment not set up: Staging');
} else {
    throw new Error('Invalid value for environment variable "Environment": ', process.env.Environment);
}

const CALLBACK_PHOTO_PROCESSING = FRESCO_ENDPOINT + 'webhook/content/photo/processing';
const CALLBACK_PHOTO_COMPLETE = FRESCO_ENDPOINT + 'webhook/content/photo/complete';
const CALLBACK_PHOTO_FAILED = FRESCO_ENDPOINT + 'webhook/content/photo/failed';
const CALLBACK_VIDEO_FAILED = FRESCO_ENDPOINT + 'webhook/content/video/failed';


let Bucket, Key;

// Main event handler
exports.handler = (event, context) => {
    if (!event.Records || event.Records.length === 0) {
        return console.error('No Records');
    }

    console.log(JSON.stringify(event));

    Bucket = event.Records[0].s3.bucket.name;
    Key = event.Records[0].s3.object.key.split('/').pop();
    let contentType = mime.lookup(Key);
    let mediaType = contentType.split('/')[0];

    console.log('Beginning media processing');
    console.log({ Bucket, Key });

    if (mediaType === 'image') {
        fetchImageFromS3(event.Records[0].s3.object.key);
    } else if (mediaType === 'video') {
        fetchVideoMetadataFromS3(event.Records[0].s3.object.key);
    } else {
        console.error('Invalid file type: ' + Key);
    }
};

// Fetches the object from the given bucket
function fetchImageFromS3(raw_key) {
    console.log('Fetch from s3...');
    S3.getObject({ Bucket, Key: raw_key }, (err, object) => {
        if (err) {
            return error(err, 'Fetching getting object from S3');
        }

        if (object.ContentType.includes('image/')) {
            beginProcessingImage(object);
        } else if (object.ContentType.includes('video/')) {
            processVideo(object);
        } else {
            console.error('Invalid ContentType: ' + object.ContentType);
        }
    });
}

// Hit Fresco marking the post as processing
function beginProcessingImage(object) {
    if (!object.Metadata.post_id) return processImage(object);
    superagent
        .post(CALLBACK_PHOTO_PROCESSING)
        .set('Authorization', BASIC_AUTH)
        .send({ post_id: object.Metadata.post_id })
        .end((err, res) => {
            if (err) {
                return fail(err, 'Error updating image as processing', { post_id: object.Metadata.post_id, is_video: false });
            }
            processImage(object);
        });
}

// Process image file, get meta data, correct rotation, etc
function processImage(object) {
    console.log('Processing image...');
    let img = gm(object.Body);
    let updates = {};

    img.identify((err, data) => {
        if (err) {
            return fail(err, 'Error identifying image', { post_id: object.Metadata.post_id, is_video: false });
        }

        let rotation_deg = getRotationDegreesFromExifVal(data.Properties['exif:Orientation']);
        updates.height = data.size.height;
        updates.width = data.size.width;

        // Remove borders on submissions
        if (Key.includes('_submission')) img.trim();

        img
            .rotate('black', rotation_deg)
            .noProfile()
            .toBuffer('jpg', (err, buffer) => {
                if (err) return error(err, 'Error creating image buffer');

                object.Body = buffer;
                object.Extension = 'jpg';
                object.ContentType = 'image/jpeg';

                saveImage(object, updates);
            });
    });
}

// Saves the processed image file to the correct bucket directory
function saveImage(object, updates) {
    console.log('Saving image to s3...');
    S3.putObject({
        Bucket: Bucket,
        Key: `images/${Key.split('.')[0]}.${object.Extension}`,
        ACL: 'public-read',
        Body: object.Body,
        ContentType: object.ContentType,
        ContentDisposition: 'inline',
        CacheControl : 'max-age=86400'
    }, (err) => {
        if (err) fail(err, 'Error saving image', { post_id: object.Metadata.post_id, is_video: false });
        else finishProcessingImage(object.Metadata.post_id, updates);
    });
}

function finishProcessingImage(post_id, updates) {
    if (!post_id) return;
    updates.post_id = post_id;
    superagent
        .post(CALLBACK_PHOTO_COMPLETE)
        .set('Authorization', BASIC_AUTH)
        .send(updates)
        .end((err, res) => {
            if (err) {
                return fail(err, 'Error marking post as finished', { post_id, is_video: false });
            }
        });
}

// Fetches the object from the given bucket
function fetchVideoMetadataFromS3(raw_key) {
    console.log('Fetch from s3...');
    S3.headObject({ Bucket, Key: raw_key }, (err, object) => {
        if (err) {
            return console.error(err, 'Fetching getting video metadata from S3');
        }

        processVideo(object);
    });
}

// Create job to transacode video to MP4 and M3U8 formats
function processVideo(object) {
    console.log('Creating video transcoder job...');
    let fileName = Key.split('.')[0];
    let updates = {};

    ElasticTranscoder.createJob({
        PipelineId: pipelineId,
        UserMetadata: object.Metadata,
        Input: {
            Key: 'raw/' + Key,
            FrameRate: 'auto',
            Resolution: 'auto',
            AspectRatio: 'auto',
            Interlaced: 'auto',
            Container: 'auto'
        },
        Outputs: [
            {
                Key: 'videos/' + fileName + '.mp4',
                ThumbnailPattern: "images/" + fileName + '-thumb-{count}',
                PresetId: '1479922376909-91q3ai',
                Rotate: 'auto'
            },
            {
                Key: 'streams/hls4000k/' + fileName,
                SegmentDuration: '5',
                PresetId: '1479922510738-x767fp',
                Rotate: 'auto'
            },
            {
                Key: 'streams/hls2000k/' + fileName,
                SegmentDuration: '5',
                PresetId: '1479922502476-md83hu',
                Rotate: 'auto'
            },
            {
                Key: 'streams/hls1500k/' + fileName,
                SegmentDuration: '5',
                PresetId: '1479922139410-l4c6bv',
                Rotate: 'auto'
            },
            {
                Key: 'streams/hls1000k/' + fileName,
                SegmentDuration: '5',
                PresetId: '1479922107176-myoc81',
                Rotate: 'auto'
            },
            {
                Key: 'streams/hls0600k/' + fileName,
                SegmentDuration: '5',
                PresetId: '1479922077749-5yax5s',
                Rotate: 'auto'
            },
            {
                Key: 'streams/hls0400k/' + fileName,
                SegmentDuration: '5',
                PresetId: '1479922051357-81ktib',
                Rotate: 'auto'
            }
        ],
        Playlists: [
            {
                Format: "HLSv3",
                Name: 'streams/' + fileName,
                OutputKeys: [
                    'streams/hls4000k/' + fileName,
                    'streams/hls2000k/' + fileName,
                    'streams/hls1500k/' + fileName,
                    'streams/hls1000k/' + fileName,
                    'streams/hls0600k/' + fileName,
                    'streams/hls0400k/' + fileName
                ]
            }
        ]
    }, (err, data) => {
        if (err) {
            return fail(err, 'Error transcoding video', {
                post_id: object.Metadata.post_id,
                recap_id: object.Metadata.recap_id,
                is_video: true
            });
        }
    });
}

// Error handler
function fail(err, msg, options) {
    console.log('----------ERROR----------');
    console.log(msg);
    console.log({ Bucket, Key });
    console.log(err);
    console.log('-------------------------');
    console.log('Fresco callback...');

    if (options.post_id || options.recap_id) {
        superagent
            .post(options.is_video ? CALLBACK_VIDEO_FAILED : CALLBACK_PHOTO_FAILED)
            .set('Authorization', BASIC_AUTH)
            .send(options.is_video ? { post_id: options.post_id, recap_id: options.recap_id } : { post_id: options.post_id })
            .end((err) => {
                if (err) {
                    console.error('Error marking media as failed');
                    console.error(err);
                }
            });
    }
}

// Convert the EXIF rotation information to degrees of rotation
function getRotationDegreesFromExifVal(val) {
    switch(parseInt(val, 10)) {
        case 3: {
            return 180;
        }
        case 6: {
            return 90;
        }
        case 8: {
            return -90;
        }
        default: {
            return 0;
        }
    }
}
