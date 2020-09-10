'use strict';

const base64 = require('base-64');
const config = require('../../../config');
const ferror = require('../../../lib/frescoerror');
const hashids = require('../../../lib/hashids');
const mandrill = require('../../../lib/mandrill');

class EmailNotificationController {
    
    /**
     * Sends email to recipients with provided options.
     *
     * @param {string[]} recipients - Array of emails
     * @param {object} options
     * @param {string} [options.subject=Fresco News Alert]
     * @param {string} options.title
     * @param {string} options.body
     * @param {string} [options.from_email=donotreply@fresconews.com]
     * @param {string} [options.from_name=Fresco News]
     * @param {string} [options.template_name=generic]
     * @param {object[]} [template_content]
     * 
     * @returns {Promise}
     */
    send(recipients = [], { title, body, subject = 'Fresco News Alert', from_email = 'donotreply@fresconews.com', from_name = 'Fresco News', template_name = 'generic', template_content = [] } = {}) {
        if(!Array.isArray(recipients)) recipients = [recipients];

        if (template_name === 'generic') {
            template_content = [
                {
                    // title is uppercase because 'title' is the name of a special function in mandrill
                    name: 'TITLE',
                    content: title
                },
                {
                    name: 'body',
                    content: body
                }
            ];
        }

        //Use dev email templates when applicable
        if (config.SERVER.ENV !== 'production') {
            template_name = `dev-${template_name}`;
        }

        return new Promise((resolve, reject) => {
            mandrill.messages.sendTemplate({
                template_name,
                template_content: [],
                message: {
                    subject:    subject,
                    from_email: from_email,
                    from_name:  from_name,
                    to:         recipients.map(e => { return { email: e, type: 'to' }; }),
                    preserve_recipients: false, // Each recipient sees the email as being only to them
                    merge_language: 'handlebars',
                    global_merge_vars: template_content
                },
            }, (result) => {
                if (result[0].status === 'invalid' || result[0].status === 'rejected') {
                    return reject(
                        ferror(ferror.FAILED_REQUEST)
                            .msg('Error sending emails.')
                            .trip(reject)
                    );
                }

                resolve();
            });
        });
    }

    /**
     * Creates a string with the correctly formatted anchor tags for emails.
     * Will implement click tracking eventually
     * 
     * @param {String}  link        The link that the user should be sent to
     * @param {String}  content     HTML content that's displayed to the user
     * @param {Boolean} absolute    Whether the link is absolute, or should be prefixed with the web server's url
     * @param {Boolean} anchor      Whether to surround the link with an anchor tag
     * @param {object}  referral    Any referral parameters to be encoded in the link
     * 
     * @returns {String} A string with an anchor(<a></a>) tag linking to the specified place
     */
    createEmailLink({
        link,
        content,
        absolute = false,
        anchor = true,
        referral
    } = {}) {
        let href = absolute ? link : `${config.SERVER.WEB_ROOT}${link}`;
        if (referral) {
            href += `?referral=${encodeURIComponent(base64.encode(JSON.stringify(referral)))}`;
        }
        return anchor ? `<a style="text-decoration: none; font-weight: 700; color: #212121;" href="${href}">${content}</a>` : href;
    }

    /**
     * Creates email template content for the given gallery
     * @param {Model<Gallery>} gallery  A gallery model (with related posts attached)
     * @param {Object} referral         An object containing any referral parameters to be added to the generated links
     * @returns {{caption, gallery_link: string, posts: Array, single_post: boolean}}
     */
    createEmailGallery(gallery, referral = {}) {
        const gallery_link = this.createEmailLink({
            link: `gallery/${hashids.encode(gallery.get('id'))}`,
            anchor: false,
            referral: Object.assign(referral, {
                gallery_id: hashids.encode(gallery.get('id'))
            })
        });

        return {
            caption: gallery.get('caption'),
            gallery_link,
            posts: gallery.related('posts').models.map(post => {
                let image = post.get('image');

                // Force small images to be squares
                if (gallery.related('posts').models.length > 1) {
                    image = image.replace('images', 'images/600x600')
                }

                const post_link = this.createEmailLink({
                    link: `post/${hashids.encode(post.get('id'))}`,
                    anchor: false,
                    referral: Object.assign(referral, {
                        gallery_id: hashids.encode(gallery.get('id')),
                        post_id: hashids.encode(post.get('id'))
                    })
                });

                return {
                    image,
                    link: post_link,
                    video: !!post.get('video')
                }
            }),
            single_post: gallery.related('posts').models.length == 1
        }
    }
}

module.exports = new EmailNotificationController;