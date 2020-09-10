INSERT INTO api_versions (version_major, version_minor) VALUES (2, 1);

INSERT INTO roles (entity, tag, name, scopes) VALUES
    ('user', 'user', 'Basic User', '{user::}'),
    ('user', 'admin', 'Administrator', '{admin::}'),
    ('outlet', 'outlet-admin', 'Administrator', '{outlet::}'),
    ('outlet', 'outlet-content-manager', 'Content Manager', '{outlet:purchase:}'),
    ('outlet', 'outlet-assignment-manager', 'Assignment Manager', '{outlet:assignment:}'),
    
    ('client', 'public', 'Publishable Keys', '{client:auth:,client:gallery:get,client:post:get,client:story:get,client:user:get,client:assignment:get,client:gallery-comment:get,client:outlet:get}'),
    ('client', 'private', 'Private Keys', '{client::}'),

    -- 3rd party integration clients
    ('client', 'stripe', 'Stripe Keys', '{stripe::}'),
    ('client', 'scheduler', 'Scheduler Server Keys', '{scheduler::}'),
    ('client', 'aws', 'AWS Keys', '{aws::}'),
    ('client', 'zoho', 'ZOHO Keys', '{zoho::}'),
    ('client', 'mrss', 'MRSS Keys', '{mrss::}');

    ('token', 'read', 'Read Only Token', '{::get}'),
    ('token', 'write', 'Read and Write Token', '{::}');

INSERT INTO oauth_clients (tag, client_id, client_secret, api_version_id, role_id) VALUES
    (
        'Fresco Web',
        'G2Kcv7lZmGT1h2GpiUuaxmm2Ie4Z0ljLux8cu9aMjf0u8tx2OsA7jHBgE7cE',
        'w3LcO0UV8kjzXV3FiBIeuAPaihMZFMaPOXXB4IZZVtXMrQSYZ6zqjZRHgtQ23X4zIn14yyCXGrnK7kZs4qPhYpkqSgBlTYq4ZEyn9vXDVPjh5RNHeickuPKtocryo28rOoaZa6mQHo3nR5kanS96XEO6GRUZDmAzlKw5rTY39tgtM3DxQ3y1t4WzSKJkN3',
        (SELECT id FROM api_versions ORDER BY version_major DESC, version_minor DESC LIMIT 1),
        (SELECT id FROM roles WHERE entity = 'client' AND tag = 'private')
    ),
     (
        'Fresco iOS',
        'FggpZkXKiur4zzFWOhkQJRcDQpsg0g8jgbazLYNcCf2RfSukoYutk2wSJLFf',
        'tI8a6k1oRuwi32hozZfLloVmyEzbpAvSxRnc6eKyiLUSq0eP61NFT03WOAewPcKQENayE986q6e2ajA97O9vr5PvnG9m3wNG6DGMkCNWpzKtkDBuYL1wBL8LOK7EDJJWYXljzzxcI6paSULEvAtI6YvneQmlBOYShvzhR0IMHl3roMNi3sK2MMIB3EKDQM',
        (SELECT id FROM api_versions ORDER BY version_major DESC, version_minor DESC LIMIT 1),
        (SELECT id FROM roles WHERE entity = 'client' AND tag = 'private')
    ),
    (
        'Fresco Android',
        'uG3o45tMAckhog0TE7S1BbYiBiBDEsjXYgEVOgZkO2OJgopRBHq5qzY3FnBp',
        'txW2DhFIPhBq0YymjTcRae7rFIJQEfu9w0EAOJyhI4ZfI1Hy9sQ5JpveRpLBwil2n6y4vJVk1LV7m4tZ3QDbsFO9CDuaA3HuTTPLJmTFvtmIK1bXiOMF5efQ2oIjb34X5WN8IsGcGM8rxQBTBxC3IcIiAbbKAizgowINjsz32pNYbnwwKjgyWqSaJfHskm',
        (SELECT id FROM api_versions ORDER BY version_major DESC, version_minor DESC LIMIT 1),
        (SELECT id FROM roles WHERE entity = 'client' AND tag = 'private')
    ),
    (
        'Stripe API',
        'AQurjLbTkb4rd32s',
        'grRaKjdBzWasH4kDexkUR9fmLCzLsr89',
        (SELECT id FROM api_versions ORDER BY version_major DESC, version_minor DESC LIMIT 1),
        (SELECT id FROM roles WHERE entity = 'client' AND tag = 'stripe')
    ),
    (
        'Fresco Scheduler',
        'rzxZFEn7ceHKN5by',
        'F8Rf4RFrw3We8jZx8SNRqLAHFh9vpL8p',
        (SELECT id FROM api_versions ORDER BY version_major DESC, version_minor DESC LIMIT 1),
        (SELECT id FROM roles WHERE entity = 'client' AND tag = 'scheduler')
    ),
    (
        'AWS',
        'hCxfFMsBDxa945eH',
        'MezAVXxcsqPSCVjeqG8qJ8FFvNDFwYtP',
        (SELECT id FROM api_versions ORDER BY version_major DESC, version_minor DESC LIMIT 1),
        (SELECT id FROM roles WHERE entity = 'client' AND tag = 'aws')
    ),
    (
        'ZOHO API',
        'MnMy5jpR7RUwrv6R',
        'My2tjdsPqarGL93Lm6eZYRA6CyT7xhkP',
        (SELECT id FROM api_versions ORDER BY version_major DESC, version_minor DESC LIMIT 1),
        (SELECT id FROM roles WHERE entity = 'client' AND tag = 'zoho')
    ),
    (
        'MRSS',
        't7vS9gwHGK6jsT7TStdP4hfH9sRAZpVw',
        '2kCf5dmk5aajSjax8wY9MAAerUN49PhBeaFYfQsVuxwR5y39sTUj8GHNhgRywQS4',
        (SELECT id FROM api_versions ORDER BY version_major DESC, version_minor DESC LIMIT 1),
        (SELECT id FROM roles WHERE entity = 'client' AND tag = 'mrss')
    )
    ON CONFLICT DO NOTHING;

INSERT INTO notification_types (type) VALUES
    ('outlet-assignment-pending'),
    ('outlet-assignment-rejected'),
    ('outlet-assignment-approved'),
    ('outlet-assignment-accepted'),
    ('outlet-assignment-content'),
    ('outlet-assignment-expired'),
    ('outlet-new-purchase'),
    ('outlet-invite-accepted'),
    ('outlet-invite-pending'),
    ('outlet-payment-invalid'),
    
    ('user-news-photos-of-day'),
    ('user-news-today-in-news'),
    ('user-news-gallery'),
    ('user-news-story'),
    ('user-news-custom-push'),
    ('user-social-followed'),
    ('user-social-gallery-liked'),
    ('user-social-repost-liked'),
    ('user-social-reposted'),
    ('user-social-commented'),
    ('user-social-mentioned-comment'),
    ('user-dispatch-content-verified'),
    ('user-dispatch-new-assignment'),
    ('user-dispatch-assignment-expired'),
    ('user-dispatch-purchased'),
    ('user-payment-payment-expiring'),
    ('user-payment-payment-sent'),
    ('user-payment-payment-declined'),
    ('user-payment-tax-info-required'),
    ('user-payment-tax-info-processed'),
    ('user-payment-tax-info-declined'),
    ('user-promo-code-entered'),
    ('user-promo-first-assignment'),
    ('user-promo-recruit-fulfilled');

INSERT INTO setting_types (type, options_default, title, description) VALUES
  -- OUTLET NOTIFICATION SETTINGS
    (
        'notify-outlet-assignment-pending',
        '{ "send_sms": true, "send_email": true, "send_fresco": false, "send_push": false }'::JSONB,
        'Pending assignments',
        'Alerts when someone in your outlet submits an assignment'
    ),
    (
        'notify-outlet-assignment-rejected',
        '{ "send_sms": true, "send_email": true, "send_fresco": false, "send_push": false }'::JSONB,
        'Rejected assignments',
        'Alerts when an assignment has been rejected'
    ),
    (
        'notify-outlet-assignment-approved',
        '{ "send_sms": true, "send_email": true, "send_fresco": false, "send_push": false }'::JSONB,
        'Approved assignments',
        'Alerts when an assignment has been approved and deployed'
    ),
    (
        'notify-outlet-assignment-accepted',
        '{ "send_sms": true, "send_email": true, "send_fresco": false, "send_push": false }'::JSONB,
        'Accepted assignments',
        'Alerts when an assignment has been accepted by a user'
    ),
    (
        'notify-outlet-assignment-content',
        '{ "send_sms": true, "send_email": true, "send_fresco": false, "send_push": false }'::JSONB,
        'New assignment content',
        'Alerts when new content is submitted to your assignment'
    ),
    (
        'notify-outlet-assignment-expired',
        '{ "send_sms": true, "send_email": true, "send_fresco": false, "send_push": false }'::JSONB,
        'Expired assignments',
        'Alerts when new content is submitted to your assignment'
    ),
    (
        'notify-outlet-new-purchase',
        '{ "send_sms": true, "send_email": true, "send_fresco": false, "send_push": false }'::JSONB,
        'New purchases',
        'Alerts for new content available in your vault'
    ),
    (
        'notify-outlet-invite-accepted',
        '{ "send_sms": true, "send_email": true, "send_fresco": false, "send_push": false }'::JSONB,
        'Accepted invites',
        'Alerts when an invite to your outlet is accepted'
    ),
    (
        'notify-outlet-invite-pending',
        '{ "send_sms": true, "send_email": true, "send_fresco": false, "send_push": false }'::JSONB,
        'Pending invites',
        'Alerts when there is a pending invite to your outlet'
    ),
    (
        'notify-outlet-payment-invalid',
        '{ "send_sms": true, "send_email": true, "send_fresco": false, "send_push": false }'::JSONB,
        'Invalid Payment Method',
        'Alerts when payment information is invalid'
    ),

    -- USER NOTIFICATION SETTINGS
    (
        'notify-user-news-photos-of-day',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-news-today-in-news',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-news-gallery',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-news-story',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-news-custom-push',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-social-followed',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-social-gallery-liked',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-social-repost-liked',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-social-reposted',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-social-commented',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-social-mentioned-comment',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-dispatch-content-verified',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-dispatch-new-assignment',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-dispatch-assignment-expired',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-dispatch-purchased',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-payment-payment-expiring',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-payment-payment-sent',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-payment-payment-declined',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-payment-tax-info-required',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-payment-tax-info-processed',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-payment-tax-info-declined',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-promo-code-entered',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-promo-first-assignment',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    ),
    (
        'notify-user-promo-recruit-fulfilled',
        '{ "send_sms": false, "send_email": false, "send_fresco": true, "send_push": true }',
        DEFAULT,
        DEFAULT
    );