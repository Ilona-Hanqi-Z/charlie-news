CREATE TABLE user_blocks (
      blocking_user_id BIGINT NOT NULL,
      blocked_user_id BIGINT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(blocking_user_id, blocked_user_id)
  );