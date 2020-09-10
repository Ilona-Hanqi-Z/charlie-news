DROP TABLE IF EXISTS api_versions CASCADE;
DROP TABLE IF EXISTS articles CASCADE;
DROP TABLE IF EXISTS assignment_outlets CASCADE;
DROP TABLE IF EXISTS assignment_users CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS comment_entities CASCADE;
DROP TABLE IF EXISTS db_version CASCADE;
DROP TABLE IF EXISTS following_users CASCADE;
DROP TABLE IF EXISTS galleries CASCADE;
DROP TABLE IF EXISTS gallery_articles CASCADE;
DROP TABLE IF EXISTS gallery_comments CASCADE;
DROP TABLE IF EXISTS gallery_likes CASCADE;
DROP TABLE IF EXISTS gallery_posts CASCADE;
DROP TABLE IF EXISTS gallery_reports CASCADE;
DROP TABLE IF EXISTS gallery_reposts CASCADE;
DROP TABLE IF EXISTS installations CASCADE;
DROP TABLE IF EXISTS installation_subscriptions CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS notification_users CASCADE;
DROP TABLE IF EXISTS notification_types CASCADE;
DROP TABLE IF EXISTS oauth_authorization_codes CASCADE;
DROP TABLE IF EXISTS oauth_access_tokens CASCADE;
DROP TABLE IF EXISTS oauth_client_families CASCADE;
DROP TABLE IF EXISTS oauth_clients CASCADE;
DROP TABLE IF EXISTS outlet_invites CASCADE;
DROP TABLE IF EXISTS outlet_location_notification_settings CASCADE;
DROP TABLE IF EXISTS outlet_locations CASCADE;
DROP TABLE IF EXISTS outlet_payment CASCADE;
DROP TABLE IF EXISTS outlets CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS purchases CASCADE;
DROP TABLE IF EXISTS recap_stories CASCADE;
DROP TABLE IF EXISTS recaps CASCADE;
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS setting_types CASCADE;
DROP TABLE IF EXISTS social_links CASCADE;
DROP TABLE IF EXISTS stories CASCADE;
DROP TABLE IF EXISTS story_articles CASCADE;
DROP TABLE IF EXISTS story_comments CASCADE;
DROP TABLE IF EXISTS story_galleries CASCADE;
DROP TABLE IF EXISTS story_likes CASCADE;
DROP TABLE IF EXISTS story_reposts CASCADE;
DROP TABLE IF EXISTS user_blocks CASCADE;
DROP TABLE IF EXISTS user_locations CASCADE;
DROP TABLE IF EXISTS user_identities CASCADE;
DROP TABLE IF EXISTS user_payment CASCADE;
DROP TABLE IF EXISTS user_reports CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;

\i ./tables/api_versions.sql
\i ./tables/articles.sql
\i ./tables/assignment_outlets.sql
\i ./tables/assignment_users.sql
\i ./tables/assignments.sql
\i ./tables/comments.sql
\i ./tables/comment_entities.sql
\i ./tables/db_version.sql
\i ./tables/following_users.sql
\i ./tables/galleries.sql
\i ./tables/gallery_articles.sql
\i ./tables/gallery_comments.sql
\i ./tables/gallery_likes.sql
\i ./tables/gallery_posts.sql
\i ./tables/gallery_reports.sql
\i ./tables/gallery_reposts.sql
\i ./tables/installations.sql
\i ./tables/installation_subscriptions.sql
\i ./tables/notifications.sql
\i ./tables/notification_users.sql
\i ./tables/notification_types.sql
\i ./tables/roles.sql
\i ./tables/oauth_authorization_codes.sql
\i ./tables/oauth_access_tokens.sql
\i ./tables/oauth_client_families.sql
\i ./tables/oauth_clients.sql
\i ./tables/outlet_invites.sql
\i ./tables/outlet_location_notification_settings.sql
\i ./tables/outlet_locations.sql
\i ./tables/outlet_payment.sql
\i ./tables/outlets.sql
\i ./tables/posts.sql
\i ./tables/purchases.sql
\i ./tables/recap_stories.sql
\i ./tables/recaps.sql
\i ./tables/reports.sql
\i ./tables/setting_types.sql
\i ./tables/social_links.sql
\i ./tables/stories.sql
\i ./tables/story_articles.sql
\i ./tables/story_comments.sql
\i ./tables/story_galleries.sql
\i ./tables/story_likes.sql
\i ./tables/story_reposts.sql
\i ./tables/user_blocks.sql
\i ./tables/user_locations.sql
\i ./tables/user_identities.sql
\i ./tables/user_payment.sql
\i ./tables/user_reports.sql
\i ./tables/user_roles.sql
\i ./tables/user_settings.sql
\i ./tables/users.sql