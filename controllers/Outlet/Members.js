'use strict';

const _ = require('lodash');
const crypto = require('crypto');
const Promise = require('bluebird');

const config = require('../../config');

const auth = require('../../lib/auth');
const ferror = require('../../lib/frescoerror');
const hashIds = require('../../lib/hashids');
const reporter = require('../../lib/reporter');

const Outlet = require('../../models/outlet');
const OutletInvite = require('../../models/outlet_invite');
const User = require('../../models/user');

/**
 * Class for managing outlet members & invites
 */
class OutletMemberController {

    /**
     * Joins user into the outlet matching the token
     * @param  {Object} user_model User model to join
     * @param  {String} token Token for the outlet invite
     * @return {Promise} Resovle/Reject
     */
    join(user_model, token, trx) {
        let outlet_invite;
        //Grab invite and do checks
        return OutletInvite
            .where({ token: token })
            .fetch({ 
                transacting: trx, 
                withRelated: [ 'outlet', 'outlet.members', 'outlet.members.roles' ]
            })
            .then(invite_model => {
                if(!invite_model) {
                    return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .param('outlet[token]')
                            .msg('Invalid outlet invitation token!')
                    );
                } else if(invite_model.get('status') == 'expired') {
                    return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .param('outlet[token]')
                            .msg('This invitation has already expired!')
                    );
                } else if(invite_model.get('status') == 'used') {
                    return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .param('outlet[token]')
                            .msg('This invitation has already been used!')
                    );
                }

                outlet_invite = invite_model;

                //Actually join the outlet once we're in the clear
                // TODO handle new roles
                return user_model
                    .save({
                        outlet_id: outlet_invite.related('outlet').get('id')
                    }, {
                        patch: true,
                        transacting: trx
                    });
            })
            .then(() =>
                //Save user_id to outlet_invite
                outlet_invite
                    .save({
                        user_id: user_model.get('id'),
                        used: true
                    }, {
                        patch: true,
                        transacting: trx
                    })
            )
            .then(() => // detach any existing outlet roles form the user
                RoleController
                    .getMany({ entity: 'outlet' }, { trx })
                    .then(role_models =>
                        user_model
                            .roles()
                            .detach(role_models, { transacting: trx })
                    )
            )
            .then(() =>
                RoleController // TODO outlet-admin is a PLACEHOLDER, IMPLEMENT OPTIONAL ROLES
                    .getOne({ tag: 'outlet-admin' }, { trx })
                    .then(role_model =>
                        user_model
                            .roles()
                            .attach(role_model, { transacting: trx })
                    )
            )
            .then(() => {
                notifyOutlet(outlet_invite.related('outlet'));
                return outlet_invite;
            })
            .catch(err => Promise.reject(ferror.constraint(err)));

        function notifyOutlet(outlet) {
            let members = outlet.related('members').filter(mem => mem.can('outlet', 'get', 'member'));

            //<a href="${config.SERVER.WEB_ROOT}outlet/settings">${outlet.get('title')}</a>
            const settingsLink = NotificationController.Mediums.Email.createEmailLink({
                link: 'outlet/settings',
                content: outlet.get('title'),
                referral: {
                    type: 'email',
                    email_name: 'outlet-member-joined'
                }
            });

            // TODO notification error reporting
            // TODO " and was delivered to N users"
            NotificationController
                .notify({
                    type: 'outlet-invite-accepted',
                    recipients: {
                        users: members
                    },
                    payload: {
                        sms: `${user_model.get('full_name') || user_model.get('username')} has joined ${outlet.get('title')} on Fresco News.`,
                        email: {
                            subject: 'New outlet member',
                            title: `New member: ${user_model.get('full_name') || user_model.get('username')}`,
                            body: `${user_model.get('full_name') || user_model.get('username')} has joined ${settingsLink} on Fresco News.`
                        }
                    }
                })
                .catch(reporter.report);
        }
    }

    /**
     * Removes outlet member from their outlet
     * @param  {integer} member_id  User ID of the outlet member
     * @return {Object} Object for success/failure state
     */
    removeMember(user_id, { user, outlet, trx }) {
        let outlet_id;

        if (outlet) {
            outlet_id = outlet.get('id');
        } else if (user && !user.related('outlet').isNew()) {
            outlet_id = user.related('outlet').get('id');
        } else {
            return Promise.reject(ferror(ferror.FORBIDDEN));
        }

        return User
            .where({
                id: user_id,
                outlet_id
            })
            .fetch({
                require: true,
                transacting: trx
            })
            .then(user_model =>
                user_model.save({
                    outlet_id: null
                }, {
                    patch: true,
                    transacting: trx
                })
            )
            .then(user_model =>
                RoleController
                    .getMany({ entity: 'outlet' }, { trx })
                    .then(role_models =>
                        user_model
                            .roles()
                            .detach(role_models, { transacting: trx })
                    )
            )
            .then(r => Promise.resolve({ success: 'ok' }))
            .catch(User.NotFoundError, () =>
                Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Invalid user')
                )
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Creates invites and sends notifs to a respective emails
     * @param  {array} emails The emails to send the invites to
     * @return {object} The invite object
     */
    invite(user_model, emails = [], trx) {
        // If one of the emails is already a member of the outlet, don't allow them to be re-invited
        let lower_emails = emails.map(email => email.toLowerCase());
        let errors = [];
        return User
            .query(qb => {
                qb.count('*');
                qb.whereIn('users.email', lower_emails);
                qb.where('outlet_id', user_model.related('outlet').get('id'));
            })
            .fetch({ transacting: trx })
            .then(result => {
                if (parseInt(result.get('count')) > 0) {
                    return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .msg('One or more emails are already a member of this outlet')
                    );
                }

                //Fetch users with matching emails
                return User.query(qb => qb.whereIn('email', emails)).fetchAll({ transacting: trx });
            })
            .then(user_models => {
                const userInvites = user_models.map(user => {
                    //Splice from array to prevent creating an email invite
                    emails.splice(emails.indexOf(user.get('email')), 1);

                    if(user.get('id') === user_model.related('outlet').get('owner')) {
                        return Promise.reject(
                            ferror(ferror.INVALID_REQUEST)
                                .msg('You can\'t send an invite to the owner of the outlet!')
                        );
                    }

                    return {
                        outlet_id: user_model.related('outlet').get('id'),
                        user_id: user.get('id'),
                        email: user.get('email'),
                        token: crypto.randomBytes(64).toString('hex')
                    }
                });

                const emailInvites = emails.map(email => {
                    return {
                        outlet_id: user_model.related('outlet').get('id'),
                        token: crypto.randomBytes(64).toString('hex'),
                        email
                    }
                });

                return userInvites.concat(emailInvites);
            })
            .then(invites => {
                //Create invites with final array
                return Promise.map(invites, (invite, index) => new Promise(yes => {
                    OutletInvite
                        .knex('outlet_invites')
                        .insert(invite)
                        .returning('email')
                        .transacting(trx)
                        .then(([ email ] = []) => {
                            const registerUrl = NotificationController.Mediums.Email.createEmailLink({
                                link: `join/${invite.token}`,
                                content: 'here',
                                referral: {
                                    type: 'email',
                                    email_name: 'outlet-invite'
                                }
                            });
                            return NotificationController.Mediums.Email
                                .send(invite.email, {
                                    subject: `You've been invited!`,
                                    title: `You've been invited!`,
                                    body: `You've been invited by ${user_model.related('outlet').get('title')} to be a member of their
                                    outlet on Fresco News. To register, click the link below and fill out the registration form. 
                                    <br/><br/> To register click ${registerUrl}`
                                })
                                .then(() => yes(email));
                        })
                        .catch(ferror.constraint(err => {
                            err.param(`emails[${index}]`);
                            err.value(invite.email);
                            errors.push(err.res());
                            yes(false);
                        }));
                }))
            })
            .then(result => {
                result = result.filter(Boolean);
                notify(result);
                return { result, errors };
            })
            .catch(err => Promise.reject(ferror.constraint(err)));

        function notify(emails = []) {
            if (!emails.length) return;
            
            user_model
                .related('outlet')
                .members()
                .fetch({
                    withRelated: [ 'roles' ],
                    transacting: trx
                })
                .then(mems => mems.filter(m => auth.checkPermission('outlet:outlet-invite:create', auth.scopesToRegex(m.scopes())))) // Only send to admins w/ member privileges
                .then(notif_send)
                .catch(ferror.constraint(reporter.report));

            function notif_send(users = []) {

                // <a href="${config.SERVER.WEB_ROOT}outlet/settings">${user_model.related('outlet').get('title')}</a>
                const settingsLink = NotificationController.Mediums.Email.createEmailLink({
                    link: 'outlet/settings',
                    content: user_model.related('outlet').get('title'),
                    referral: {
                        type: 'email',
                        email_name: 'invite-pending'
                    }
                });

                NotificationController
                    .notify({
                        type: 'outlet-invite-pending',
                        recipients: { users },
                        payload: {
                            sms: `${emails.length === 1 ? 'An invitation' : emails.length + ' invitations'} to ${user_model.related('outlet').get('title')} ${emails.length === 1 ? 'is' : 'are'} pending. Open ${user_model.related('outlet').get('title')}'s settings to resend.`,
                            email: {
                                subject: `${emails.length === 1 ? 'An invite is' : emails.length + ' invites are'} pending`,
                                title: `${emails.length} ${emails.length === 1 ? 'invite is' : 'invites are'} pending`,
                                body: `${emails.length} ${emails.length === 1 ? 'invitation' : 'invitations'} to ${user_model.related('outlet').get('title')} ${emails.length === 1 ? 'is' : 'are'} pending. Open ${settingsLink}'s settings to resend.`
                            }
                        }
                    })
                    .catch(reporter.report);
            }
        }
    }

    /**
     * Retrieves invite information     
     * @param {String} token Token of the invite
     */
    getInvite(token) {
        return new Promise((resolve, reject) => {
            OutletInvite
                .where('token', token)
                .fetch({
                    withRelated: [
                        { 
                            user: qb => {
                                qb.select(User.FILTERS.PUBLIC);
                            } 
                        },
                        'outlet'
                    ]
                })
                .then(result => {
                    if(result === null) {
                        reject(ferror(ferror.NOT_FOUND).msg('There is no invitation matching this token!'))
                    } else {    
                        resolve(result);
                    }
                })
                .catch(ferror.constraint(reject));
        });
    }

    /**
     * Revokes invite
     * @param {String} token The token of the invite to revoke
     */
    revokeInvite(user_model, token) {
        return new Promise((resolve, reject) => {
            OutletInvite
                .where('token', token)
                .destroy()
                .then(r => resolve({ success: 'ok' }))
                .catch(ferror.constraint(reject));
        });
    }

    /**
     * Resends invite for the passed invite token
     * @param {Model} user_model
     * @param {String} token The token of the invite to resend
     */
    resendInvite(user_model, token) {
        return new Promise((resolve, reject) => {
            OutletInvite
                .where('token', token)
                .fetch({ require: true, withRelated: ['outlet'] })
                .then(invite => {
                    const registerUrl = NotificationController.Mediums.Email.createEmailLink({
                        link: `join/${invite.token}`,
                        content: 'here',
                        referral: {
                            type: 'email',
                            email_name: 'outlet-invite'
                        }
                    });
                    return NotificationController.Mediums.Email.send(invite.get('email'), {
                        subject: `You've been invited!`,
                        title: `You've been invited!`,
                        body: `You've been invited by ${invite.related('outlet').get('title')} to be a member of their
                        outlet on Fresco News. To register, click the link below and fill out the registration form. 
                        <br/><br/> To register click ${registerUrl}`
                    });
                })
                .then(() => resolve({ success: 'ok' }))
                .catch(OutletInvite.NotFoundError, ferror(ferror.NOT_FOUND).msg('Invite not found').trip(reject))
                .catch(ferror.constraint(reject));
        });
    }

    /**
     * Lists the invites for an outlet
     * @param  {Model} user_model
     * @return {Promise}
     */
    listInvites(user_model, outlet_id = null) {
        if(!outlet_id) {
            outlet_id = user_model.related('outlet').get('id')
        }

        return new Promise((resolve, reject) => {
            OutletInvite
                .query({
                    where: {
                        outlet_id,
                        used: false
                    }
                })
                .orderBy('created_at', 'ASC')
                .fetchAll()
                .then(resolve)
                .catch(ferror.constraint(reject))
        });
    }
}

module.exports = new OutletMemberController;

const NotificationController = require('../Notification');
const RoleController = require('../Auth/Role');