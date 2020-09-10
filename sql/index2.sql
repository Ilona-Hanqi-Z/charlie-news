-- THESE ARE ALL OF THE OLE MIGRATION COLUMNS

ALTER TABLE articles DROP COLUMN __mongo_id;
ALTER TABLE articles DROP COLUMN __mongo_outlet_title;

ALTER TABLE assignment_outlets DROP COLUMN __mongo_assignment_id;
ALTER TABLE assignment_outlets DROP COLUMN __mongo_outlet_id;

ALTER TABLE assignments DROP COLUMN __mongo_id;
ALTER TABLE assignments DROP COLUMN __mongo_creator_id;
ALTER TABLE assignments DROP COLUMN __mongo_curator_id;
ALTER TABLE assignments DROP COLUMN __mongo_post_ids;

ALTER TABLE galleries DROP COLUMN __mongo_id;
ALTER TABLE galleries DROP COLUMN __mongo_owner_id;
ALTER TABLE galleries DROP COLUMN __mongo_curator_id;
ALTER TABLE galleries DROP COLUMN __mongo_post_ids;
ALTER TABLE galleries DROP COLUMN __mongo_article_ids;

ALTER TABLE installations DROP COLUMN __parse_owner_id;
ALTER TABLE installations DROP COLUMN __mongo_id;

ALTER TABLE outlet_locations DROP COLUMN __mongo_id;
ALTER TABLE outlet_locations DROP COLUMN __mongo_outlet_id;

ALTER TABLE outlets DROP COLUMN __mongo_id;
ALTER TABLE outlets DROP COLUMN __mongo_owner_id;
ALTER TABLE outlets DROP COLUMN __mongo_user_ids;
ALTER TABLE outlets DROP COLUMN __mongo_purchases;
ALTER TABLE outlets DROP COLUMN __mongo_stripe_card_id;
ALTER TABLE outlets DROP COLUMN __mongo_stripe_card_brand;
ALTER TABLE outlets DROP COLUMN __mongo_stripe_card_last4;

ALTER TABLE posts DROP COLUMN __mongo_id;
ALTER TABLE posts DROP COLUMN __mongo_parent_id;
ALTER TABLE posts DROP COLUMN __mongo_owner_id;
ALTER TABLE posts DROP COLUMN __mongo_curator_id;
ALTER TABLE posts DROP COLUMN __mongo_external_account_id;

ALTER TABLE purchases DROP COLUMN __mongo_assignment_id;
ALTER TABLE purchases DROP COLUMN __mongo_user_id;
ALTER TABLE purchases DROP COLUMN __mongo_post_id;

ALTER TABLE recaps DROP COLUMN __mongo_id;
ALTER TABLE recaps DROP COLUMN __mongo_story_ids;

ALTER TABLE stories DROP COLUMN __mongo_id;
ALTER TABLE stories DROP COLUMN __mongo_curator_id;
ALTER TABLE stories DROP COLUMN __mongo_gallery_ids;
ALTER TABLE stories DROP COLUMN __mongo_article_ids;

ALTER TABLE users DROP COLUMN __parse_id;
ALTER TABLE users DROP COLUMN __parse_twitter_id;
ALTER TABLE users DROP COLUMN __parse_facebook_id;
ALTER TABLE users DROP COLUMN __mongo_id;
ALTER TABLE users DROP COLUMN __mongo_rank;