'use strict';

const _ = require('lodash');

class FrescoError extends Error {
    /**
     * Constructor
     * 
     * @param type  Either the type of error, or an error object for 
     *              quick API_ERROR codes
     */
    constructor(o) {
        super();

        this._fresco = true;
        if (o instanceof FrescoError) {
            this.apply(o);
        } else if (o instanceof Error) {
            this.type(o.name || Launcher.API_ERROR);
            this.trace(o.stack);
            this.code(o.status);
            this.msg(o.message);
            this.param(o.param_names);
            this.value(o.param_value);
        } else {
            this.type(o);
        }
    }

    // Applies the fields of the given ferror to this one
    apply(err) {
        this.code(err.code());
        this.type(err.type());
        this.status(err.status());
        this.msg(err.msg());
        this.value(err.value());
        this.param(err.param());
    }
    
    // Builds the error response object
    res(showStack) {
        return {
            status: this._status,
            code: this._code,
            type: this._type,
            msg: this.message,
            param: this._param,
            value: this._value,
            stack: showStack ? this._trace : undefined
        };
    }
    
    /**
     * Allows user to pass reroute a Promise error through this error class
     * @param  {Function} cb [description]
     * @return {Function}
     */
    trip(cb) {
        return err => {
            if (!(err instanceof FrescoError)) err = new FrescoError(err);
            err.apply(this);
            cb(err);
        };
    }

    constraint(cb) {
        return err => cb(makeDBError(err));
    }
    
    /**
     * These functions perform three tasks depending on the provided parameters:
     * 
     * If all arguments are provided, the respective field is altered.
     * If the first argument is UNDEFINED, functions as a getter for the respective field.
     * If the first argument is NULL, unsets the respective field
     * 
     * If type is specified (See Launcher.* error codes), will only apply change if the
     * error type matches the provided type
     * 
     * @returns {this}
     */
    code(code, type) {
        if (code === undefined) return this._code;
        if (!type || this._type === type) {
            if (code === null) delete this._code;
            else this._code = code;
        }
        return this;
    }
    msg(msg, type) {
        if (msg === undefined) return this.message;
        if (!type || this._type === type) {
            if (msg === null) delete this.message;
            else this.message = msg;
        }
        return this;
    }
    param(param, type) {
        if (param === undefined) return this._param;
        if (!type || this._type === type) {
            if (param === null) delete this._param;
            else this._param = param;
        }
        return this;
    }
    trace(trace) {
        if (trace === undefined) return this._trace;
        if (trace instanceof Error) trace = trace.stack;
        if (trace === null) delete this._trace;
        else this._trace = trace;
        return this;
    }
    status(status, type) {
        if (status === undefined) return this._status;
        if (!type || this._type === type) {
            if (status === null) delete this._status;
            else this._status = parseInt(status, 10);
        }
        return this;
    }
    type(type) {
        if (type === undefined) return this._type;
        if (type === null) {
            delete this._type;
            return this;
        }
        
        this._type = type; 
        switch (type) {
            case Launcher.API:
                this._status = 500;
                break;
            case Launcher.CONNECTION:
                this._status = 301;
                break;
            case Launcher.FAILED_REQUEST:
                this._status = 412;
                break;
            case Launcher.FORBIDDEN:
                this._status = 403;
                this.message = 'Forbidden';
                break;
            case Launcher.INVALID_REQUEST:
                this._status = 400;
                break;
            case Launcher.NOT_FOUND:
                this._status = 404;
                break;
            case Launcher.RATE_LIMITER:
                this._status = 429;
                break;
            case Launcher.UNAUTHORIZED:
                this._status = 401;
                this.message = 'Unauthorized';
                break;
            default:
                this._statusCode = 500;
        }
        return this;
    }
    value(value, type) {
        if (value === undefined) return this._value;
        if (!type || this._type === type) {
            if (value === null) this._value = null;
            else this._value = value;
        }
        return this;
    }
}

let Launcher = function() {
    return new FrescoError(...arguments);
};

Launcher.isFresco = err => err._fresco === true;

Launcher.API = 'api_error';
Launcher.CONNECTION = 'connection_error';
Launcher.FAILED_REQUEST = 'failed_request_error';
Launcher.FORBIDDEN = 'forbidden';
Launcher.INVALID_REQUEST = 'invalid_request_error';
Launcher.NOT_FOUND = 'not_found';
Launcher.RATE_LIMITER = 'rate_limiter_error';
Launcher.UNAUTHORIZED = 'unauthorized';

// TODO make it so params/values can be attached
function makeDBError(pgerr) {
    // If the error is already a fresco error, pass it on
    if (pgerr instanceof FrescoError) return pgerr;

    let error = Launcher(pgerr);
    let found = true; // must be true for default: to handle flagging it as not found

    switch (pgerr.constraint) {
        case 'already_exists':
            error.type(Launcher.INVALID_REQUEST).msg('This object already exists!');
            break;
        case 'assignment_outlets_pkey':
            error.type(Launcher.INVALID_REQUEST).msg('Outlet is already a part of this assignment!');
            break;
        case 'assignment_users_pkey':
            error.type(Launcher.FAILED_REQUEST).msg('This assignment has already been accepted!');
            break;
        case 'following_users_other_id_fkey':
            error.type(Launcher.NOT_FOUND).msg('This user does not exist!');
            break;
        case 'following_users_pkey':
            error.type(Launcher.INVALID_REQUEST).msg('You are already following this user!');
            break;
        case 'gallery_articles_pkey':
            error.type(Launcher.INVALID_REQUEST).msg('This gallery already has this article!');
            break;
        case 'gallery_likes_pkey':
            error.type(Launcher.INVALID_REQUEST).msg('You\'ve already liked this gallery!');
            break;
        case 'gallery_posts_pkey':
            error.type(Launcher.INVALID_REQUEST).msg('Post is already a member of this gallery!');
            break;
        case 'gallery_reposts_pkey':
            error.type(Launcher.INVALID_REQUEST).msg('You\'ve already reposted this gallery!');
            break;
        case 'installation_unique_device_token':
            error.type(Launcher.FAILED_REQUEST).param('installation[device_token]').msg('This token already exists!');
            break;
        case 'one_per_platform_per_user':
            error.type(Launcher.FAILED_REQUEST).msg(`This account already has a social link for ${pgerr.network || 'this platform'}.`);
            break;
        case 'one_per_platform_per_account_id':
            error.type(Launcher.FAILED_REQUEST).msg(`Another user is already using this ${pgerr.network || 'social'} account. If possible, unlink the account from the old account before linking it to a new one.`);
            break;
        case 'outlet_invite_unique':
        case 'outlet_invites_fkey':
            error.type(Launcher.FAILED_REQUEST).msg('This account has already been invited to your outlet!');
            break;
        case 'outlet_location_notification_settings_pkey':
            error.type(Launcher.FAILED_REQUEST).msg('You already have a setting object for this outlet location');
            break;
        case 'repurchase':
            error.type(Launcher.INVALID_REQUEST).param('post_id').msg('You already own this post!');
            break;
        case 'story_articles_pkey':
            error.type(Launcher.INVALID_REQUEST).msg('This story already has this article!');
            break;
        case 'story_galleries_pkey':
            error.type(Launcher.INVALID_REQUEST).msg('Story already contains gallery!');
            break;
        case 'social_import_exists':
            error.type(Launcher.INVALID_REQUEST).msg('This media has already been imported!');
            break;
        case 'story_reposts_pkey':
            error.type(Launcher.INVALID_REQUEST).msg('You\'ve already reposted this story!');
            break;
        case 'story_likes_pkey':
            error.type(Launcher.INVALID_REQUEST).msg('You\'ve already liked this story!');
            break;
        case 'unique_email':
            error.type(Launcher.INVALID_REQUEST).param('email').msg('This email address is already taken!');
            break;
        case 'unique_location_per_outlet':
            error.type(Launcher.INVALID_REQUEST).param('title').msg('This location has already been saved!');
            break;
        case 'unique_outlet_title':
            error.type(Launcher.INVALID_REQUEST).param('outlet[title]').msg('This outlet title is already taken!');
            break;
        case 'unique_platform_account':
            error.type(Launcher.INVALID_REQUEST).msg('Social account is already linked!');
            break;
        case 'unique_user_notif_setting':
            error.type(Launcher.INVALID_REQUEST).msg('There already exists a setting for this notification!');
            break;
        case 'unique_username':
            error.type(Launcher.INVALID_REQUEST).param('username').msg('This username is already taken!');
            break;
        case 'user_blocks_pkey':
            error.type(Launcher.INVALID_REQUEST).msg('You have already blocked this user!');
            break;
        case 'user_reports_user_id_fkey':
            error.type(Launcher.NOT_FOUND).msg('This user does not exist!');
            break;
        default:
            found = false;
            break;
    }

    if (!found) {
        switch (pgerr.code) {
            case '22001':
                error.type(Launcher.INVALID_REQUEST).msg('String value too long');
            case '23502':
            case '22004':
            case '39004':
                error.type(Launcher.INVALID_REQUEST).msg('Missing required parameter');
            default:
                error.type(Launcher.API);
        }
    }

    return error;
}
function makeStripeError(err) {
    if (!err) return;
    if (!err.message) err.message = ''; // lets us use string functions w/o ever crashing
    let error = new FrescoError(Launcher.FAILED_REQUEST);

    if (err.type === 'card_error' || err.type == 'StripeCardError') {
        switch (err.code) {
            case 'expired_card':
                error
                    .msg('The current active card attached to this account has expired!')
                    .code('card-expired');
                break;
            case 'card_declined':
                error
                    .msg('The card attached to this account has been declined!')
                    .code('card-declined');
                break;
            case 'missing':
                error
                    .msg('There is no valid payment method attached to this account!')
                    .code('missing-payment');
                break;
            default:
                break;
        }
    } else if (err.message.substr(0, 18) === 'Insufficient funds') {
        error
            .msg('Your account lacks the sufficient funds')
            .code('insufficient-funds');
    } else if (err.message.substr(0, 60) === "Sorry, you don't have any external accounts in that currency") {
        error
            .msg('There is no valid payment method attached to this account')
            .code('missing-payment');
    } else if (err.message === "You must provide a card that has the 'currency' field set when adding a card to a Stripe account.") {
        error.type(Launcher.INVALID_REQUEST)
            .code('invalid-payment')
            .msg('Currency field was not set on provided Stripe token')
            .param('token');
    } else if (err.message === 'This card doesn\'t appear to be a debit card.') {
        error.type(Launcher.INVALID_REQUEST)
            .code('invalid-payment')
            .msg('This does not appear to be a debit card')
            .param('token');
    } else {
        error.type(Launcher.API).msg(err.message).trace(err);
    }
    return error;
}

Launcher.constraint = a1 => {
    return _.isFunction(a1) ? err => a1(makeDBError(err)) : makeDBError(a1);
};
Launcher.stripe = a1 => {
    return _.isFunction(a1) ? err => a1(makeStripeError(err)) : makeStripeError(a1);
}

// Allows user to pass reroute a Promise error through
// this error class
Launcher.trip = cb => err => cb(new FrescoError(err));


module.exports = Launcher;
