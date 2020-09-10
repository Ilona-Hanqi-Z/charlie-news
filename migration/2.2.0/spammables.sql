ALTER TABLE following_users ADD COLUMN active BOOLEAN DEFAULT TRUE;
ALTER TABLE following_users RENAME COLUMN created_at TO action_at;
ALTER TABLE gallery_likes ADD COLUMN active BOOLEAN DEFAULT TRUE;
ALTER TABLE gallery_likes RENAME COLUMN created_at TO action_at;