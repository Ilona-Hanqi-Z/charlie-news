ALTER TABLE articles
    DROP COLUMN __mongo_id,
    DROP COLUMN __mongo_outlet_title;
ALTER TABLE assignment_outlets
    DROP COLUMN __mongo_assignment_id,
    DROP COLUMN __mongo_outlet_id;
ALTER TABLE assignments
    DROP COLUMN __mongo_id,
    DROP COLUMN __mongo_creator_id,
    DROP COLUMN __mongo_curator_id,
    DROP COLUMN __mongo_post_ids;
ALTER TABLE galleries
    DROP COLUMN __mongo_id,
    DROP COLUMN __mongo_owner_id,
    DROP COLUMN __mongo_curator_id,
    DROP COLUMN __mongo_post_ids,
    DROP COLUMN __mongo_article_ids;
ALTER TABLE installations
    DROP COLUMN __parse_owner_id,
    DROP COLUMN __mongo_id;
ALTER TABLE outlet_locations
    DROP COLUMN __mongo_id,
    DROP COLUMN __mongo_outlet_id;
ALTER TABLE outlets
    DROP COLUMN __mongo_id,
    DROP COLUMN __mongo_owner_id,
    DROP COLUMN __mongo_user_ids,
    DROP COLUMN __mongo_purchases,
    DROP COLUMN __mongo_stripe_card_id,
    DROP COLUMN __mongo_stripe_card_brand,
    DROP COLUMN __mongo_stripe_card_last4;
ALTER TABLE posts
    DROP COLUMN __mongo_id,
    DROP COLUMN __mongo_parent_id,
    DROP COLUMN __mongo_owner_id,
    DROP COLUMN __mongo_curator_id,
    DROP COLUMN __mongo_external_account_id,
    DROP COLUMN __mongo_external_account_name,
    DROP COLUMN __mongo_external_id,
    DROP COLUMN __mongo_external_url,
    DROP COLUMN __mongo_external_source;
ALTER TABLE purchases
    DROP COLUMN __mongo_assignment_id,
    DROP COLUMN __mongo_post_id,
    DROP COLUMN __mongo_user_id;
ALTER TABLE recaps
    DROP COLUMN __mongo_id,
    DROP COLUMN __mongo_story_ids;
ALTER TABLE stories
    DROP COLUMN __mongo_id,
    DROP COLUMN __mongo_curator_id,
    DROP COLUMN __mongo_gallery_ids,
    DROP COLUMN __mongo_article_ids;
ALTER TABLE users
    DROP COLUMN __parse_id,
    DROP COLUMN __parse_twitter_id,
    DROP COLUMN __parse_facebook_id,
    DROP COLUMN __mongo_id,
    DROP COLUMN __mongo_rank;

VACUUM FULL;