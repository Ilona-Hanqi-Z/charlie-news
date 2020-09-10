CREATE TABLE status (done BOOLEAN DEFAULT TRUE);

-- Api Versions
INSERT INTO api_versions (id, version_major, version_minor) VALUES (91, 2, 1);

-- Authentication roles
INSERT INTO roles (id, entity, tag, name, scopes) VALUES
    (91, 'user', 'user', 'Basic User', '{user::}'),
    (92, 'user', 'admin', 'Administrator', '{admin::}'),
    (93, 'outlet', 'outlet-admin', 'Administrator', '{outlet::}'),
    (94, 'outlet', 'outlet-content-manager', 'Content Manager', '{outlet:purchase:}'),
    (95, 'outlet', 'outlet-assignment-manager', 'Assignment Manager', '{outlet:assignment:}'),
    
    (96, 'client', 'public', 'Publishable Keys', '{client:auth:,client:gallery:get,client:post:get,client:story:get,client:user:get,client:assignment:get,client:gallery-comment:get,client:outlet:get}'),
    (97, 'client', 'private', 'Private Keys', '{client::}'),

    (98, 'token', 'read', 'Read Only Token', '{::get}'),
    (99, 'token', 'write', 'Read and Write Token', '{::}');

-- Notification Types

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

-- Setting types
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
        'Accepted assignments',
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

-- Users
INSERT INTO public.users (
    id,
    email,
    password,
    username,
    full_name,
    bio,
    location,
    phone,
    avatar,
    twitter_handle,
    terms,
    verification_token,
    created_at,
    expires_at,
    stripe_account_id,
    stripe_secret_key,
    stripe_public_key,
    charges_enabled,
    transfers_enabled,
    knows_cant_transfer,
    radius,
    reset_token,
    suspended_until,
    offense_count
) VALUES (
    258,
    'rpm0618@gmail.com',
    '$2a$10$zGqsMgH2838RCxnmi6YJc.0euXfi.uWvTZWE1rIb2SIUxjcFL2nbG',
    'rpm0618',
    'Catman Batman',
    'updated bio',
    'Hey',
    null,
    'https://d2b0djhkpermb.cloudfront.net/images/avatar/7f6786641c301bb9c1f12afeff3eaed20cd7f96b3082a63f.jpg ',
    null,
    4,
    null,
    '2016-06-13 13:45:25.343000',
    null,
    'acct_18Lz7qIzPh43glIq',
    'sk_test_KJQPFj3VfaxD3ATQRvvuz5lt',
    'pk_test_EWmCClC3TE7sTS3bGMHvDQDp',
    true,
    false,
    null,
    40234,
    null,
    null,
    0
);
INSERT INTO user_roles (user_id, role_id) VALUES (258, 93), (258, 92), (258, 91); -- Make ryan an admin, outlet admin, and regular user

INSERT INTO public.user_settings (user_id, type, options, updated_at, id) VALUES (258, 'notify-outlet-assignment-pending', '{"send_sms": true, "send_push": false, "send_email": true, "send_fresco": false}', '2016-12-13 18:30:41', 1102150);

INSERT INTO public.users (
    id,
    email,
    password,
    username,
    full_name,
    bio,
    location,
    phone,
    avatar,
    twitter_handle,
    terms,
    verification_token,
    created_at,
    expires_at,
    stripe_account_id,
    stripe_secret_key,
    stripe_public_key,
    charges_enabled,
    transfers_enabled,
    knows_cant_transfer,
    radius,
    reset_token,
    suspended_until,
    offense_count
) VALUES (
    385,
    'evan@fresconews.com',
    '$2a$10$hpLA0/kip0n0Obl6I3vdWOzPM946eR4IPPKFByRtiiIS1XZBzCI/2',
    'dingus',
    'Evanito',
    '',
    'TheFlyingButtress',
    '123123123',
    'https://cdn.dev.fresconews.com/images/93999d03f6d669155d7a59ef59d0211c_1473355345456_avatar.jpg',
    null,
    4,
    null,
    '2016-06-27 11:59:39.905000',
    null,
    'acct_18R29BISxJg7xJC7',
    'sk_test_7yekESrEWzikOH125yffN3nf',
    'pk_test_dOQqvFJHVUJYtCnsvjbXFigM',
    true,
    false,
    null,
    40234,
    null,
    null,
    0
);
INSERT INTO user_roles (user_id, role_id) VALUES (385, 91); -- Make evan a regular user

-- Galleries
INSERT INTO public.galleries (id, owner_id, caption, location, rating, created_at, updated_at, archived, tags, curator_id, address, external_id, external_url, external_account_id, external_account_name, external_source, editorial_caption, highlighted_at) VALUES 
    (1273, 258, 'T', '01040000000100000001010000006A013510A68052C0B9686DBF215A4440', 2, '2016-08-04 11:52:00.495721', '2016-08-04 12:20:44.939000', false, '{}', 385, '2–98 Mill Ln,New York NY', null, null, null, null, null, null, null),
    (99, 258, 'Highlight', '01040000000100000001010000006A013510A68052C0B9686DBF215A4440', 2, '2016-08-04 11:52:00.495721', '2016-08-04 12:20:44.939000', false, '{}', 385, '2–98 Mill Ln,New York NY', null, null, null, null, null, null, CURRENT_TIMESTAMP - INTERVAL '1 month');
INSERT INTO public.posts (id, parent_id, owner_id, image, video, stream, created_at, captured_at, location, address, width, height, status, rating, curator_id, job_id, duration, license, exclusive_to, archived, updated_at, exclusive_until) VALUES (2608, 1273, 258, 'https://d2b0djhkpermb.cloudfront.net/images/photo/51b0facfa3cf6f1b1830b96c15f30832_79c3ba125fc90466.jpeg', null, null, '2016-08-04 11:52:00.495721', null, '01010000006A013510A68052C0B9686DBF215A4440', '85 Pearl Street New York, NY 10004 USA ', 3024, 4032, 1, 2, null, null, null, 0, null, false, null, null);
INSERT INTO public.posts (id, parent_id, owner_id, image, video, stream, created_at, captured_at, location, address, width, height, status, rating, curator_id, job_id, duration, license, exclusive_to, archived, updated_at, exclusive_until) VALUES (2607, 1273, 258, 'https://d2b0djhkpermb.cloudfront.net/images/photo/1982b4bb38e2837172b81d87f90d754d_b21c1bc6bc61031a.jpeg', null, null, '2016-08-04 11:52:00.495721', null, '0101000000B301220EA38052C0207A5226355A4440', '63-199 Stone Street New York, NY 10004 USA ', 3024, 4032, 1, 2, null, null, null, 0, null, false, null, null);
INSERT INTO public.posts (id, parent_id, owner_id, image, video, stream, created_at, captured_at, location, address, width, height, status, rating, curator_id, job_id, duration, license, exclusive_to, archived, updated_at, exclusive_until) VALUES (2606, 1273, 258, 'https://d2b0djhkpermb.cloudfront.net/images/thumb/1470325999675_3463ef0fd187857621815a77b5f14f8935df32960fd8e18d4c15c474c773576a-thumb-00001.jpg', 'https://d2b0djhkpermb.cloudfront.net/videos/mp4/1470325999675_3463ef0fd187857621815a77b5f14f8935df32960fd8e18d4c15c474c773576a.mp4', 'https://d2b0djhkpermb.cloudfront.net/streams/1470325999675_3463ef0fd187857621815a77b5f14f8935df32960fd8e18d4c15c474c773576a.m3u8', '2016-08-04 11:52:00.495721', null, '01010000006A013510A68052C0B9686DBF215A4440', '85 Pearl Street New York, NY 10004 USA ', 606, 1080, 1, 2, 385, '1470325965400-0rvd97', null, 0, null, false, '2016-08-17 11:06:12.981000', null);
INSERT INTO public.gallery_posts (gallery_id, post_id, position) VALUES (1273, 2606, 0);
INSERT INTO public.gallery_posts (gallery_id, post_id, position) VALUES (1273, 2607, 1);
INSERT INTO public.gallery_posts (gallery_id, post_id, position) VALUES (1273, 2608, 2);

-- Assignments
INSERT INTO public.assignments (
    id,
    creator_id,
    curator_id,
    title,
    caption,
    rating,
    radius,
    location,
    address,
    starts_at,
    ends_at,
    created_at,
    updated_at,
    approved_at,
    curated_at
) VALUES (
    33,
    258,
    null,
    'Fire on 85 Broad',
    'Fresco News is looking for wide-angle b-roll shots of the Apple Store. Video should be recorded in clips with a minimum duration of 15 seconds. Please be sure to hold your iPhone as steady as possible! [TEST ASSIGNMENT - Do not respond]',
    1,
    0,
    '0101000000F495AC2FB78052C05D78149D1B5A4440',
    '85 Broad St, New York, NY 10004, USA',
    '2015-08-31 15:17:29.723000',
    '2015-08-31 15:23:53.618000',
    '2015-08-31 15:17:29.723000',
    '2015-08-31 15:23:53.618000',
    null,null
);
INSERT INTO public.assignments (
    id,
    creator_id,
    curator_id,
    title,
    caption,
    rating,
    radius,
    location,
    address,
    starts_at,
    ends_at,
    created_at,
    updated_at,
    approved_at,
    curated_at
) VALUES (
    34,
    258,
    null,
    'Take pictures in the elevator',
    'This is a test assignment, that has not been verified',
    0,
    16093,
    st_geomfromgeojson('{"type":"Point","coordinates":[-77.00905,38.889939]}'),
    'East Capitol St NE & First St SE, Washington, DC 20004, United States',
    '2015-08-31 15:17:29.723000',
    '2015-08-31 15:23:53.618000',
    '2015-08-31 15:17:29.723000',
    '2015-08-31 15:23:53.618000',
    null,
    null
);
INSERT INTO public.assignments (
    id,
    creator_id,
    curator_id,
    title,
    caption,
    rating,
    radius,
    location,
    address,
    starts_at,
    ends_at,
    created_at,
    updated_at,
    approved_at,
    curated_at
) VALUES (
    35,
    258,
    258,
    'Oregon Exists!',
    'Large land mass exists and its called O-rig-on',
    1,
    1000,
    st_geomfromgeojson('{"type": "Point","coordinates": [-120.36621093749999,43.77109381775651]}'),
    'Harman Rd, Brothers, OR 97712, USA',
    '2016-02-21 15:17:29.723000',
    CURRENT_TIMESTAMP + INTERVAL '1 day',
    '2016-02-21 15:17:29.723000',
    '2016-02-21 15:23:53.618000',
    '2016-02-21 15:23:53.618000',
    '2016-02-21 15:23:53.618000'
);

INSERT INTO public.outlets (
    id,
    title,
    owner_id,
    bio,
    link,
    avatar,
    goal,
    stripe_customer_id,
    verified,
    dispatch_enabled,
    created_at,
    _fts
) VALUES (
    195,
    'Ryans 2nd Outlet',
    258,
    'This is an outlet',
    'www.google.com',
    'https://d2t62bltxqtzkl.cloudfront.net/1460402109558_42554a626ec3d9dfd128033c9738d3bd.jpg',
    10,
    'cus_9hWaMLuOpFmwpz',
    true,
    true,
    '2016-10-20 13:46:26.356032 -04:00',
    null
);
UPDATE users SET outlet_id = 195 WHERE id = 258;

-- OAuth Stuff
INSERT INTO public.oauth_clients (id, client_id, client_secret, redirect_uri, created_at, role_id, api_version_id, outlet_id) VALUES 
    (91, '4040', 'androidteam', 'localhost', '2016-05-31 13:15:48.834247', 97, 91, null),
    (92, 'client1', 'secret1', 'localhost', '2016-05-31 13:15:48.834247', 97, 91, 195),
    (93, 'client2', 'secret2', 'localhost', '2016-05-31 13:15:48.834247', 97, 91, 195);
INSERT INTO public.oauth_access_tokens (role_id, client_id, user_id, token, refresh_token, expires_at) VALUES
    (99, 91, 258, 'ryan', 'refresh', CURRENT_TIMESTAMP + INTERVAL '1 month');
INSERT INTO public.oauth_authorization_codes (id, token, user_id, client_id, role_id, redirect_uri) VALUES
    (91, 'token', 258, 91, 99, 'localhost');

INSERT INTO public.user_locations (
    user_id,
    hash,
    curr_geo,
    curr_timestamp,
    prev_geo,
    prev_timestamp
) VALUES (
    258,
    'ca8cc497866944d6eff99506e8c004e8',
    st_geomfromgeojson('{"type":"Point","coordinates":[-77.65605,38.889939]}'),
    CURRENT_TIMESTAMP,
    st_geomfromgeojson('{"type":"Point","coordinates":[-77.65605,38.889939]}'),
    CURRENT_TIMESTAMP
);

INSERT INTO public.user_locations (
    user_id,
    hash,
    curr_geo,
    curr_timestamp,
    prev_geo,
    prev_timestamp
) VALUES (
    385,
    '53c2ebccaa664f12f7fa82f253947469',
    st_geomfromgeojson('{"type":"Point","coordinates":[-77.65705,38.889939]}'),
    CURRENT_TIMESTAMP,
    st_geomfromgeojson('{"type":"Point","coordinates":[-77.65705,38.889939]}'),
    CURRENT_TIMESTAMP
);

INSERT INTO status (done) values (TRUE);