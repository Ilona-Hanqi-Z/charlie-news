CREATE TABLE purchases (
    __mongo_assignment_id CHARACTER(24) DEFAULT NULL,
    __mongo_post_id CHARACTER(24) DEFAULT NULL,
    __mongo_user_id CHARACTER(24) DEFAULT NULL,

    id BIGSERIAL PRIMARY KEY,
    assignment_id BIGINT DEFAULT NULL,
    outlet_id BIGINT NOT NULL,
    post_id BIGINT NOT NULL,
    user_id BIGINT DEFAULT NULL, -- purchasing user
    amount INT NOT NULL DEFAULT 0,
    fee INT NOT NULL DEFAULT 0,
    stripe_charge_id TEXT DEFAULT NULL,
    stripe_transfer_id TEXT DEFAULT NULL,
    charge_status SMALLINT DEFAULT NULL, -- -1: failed, 0: pending, 1: complete, 2: returned, NULL: no payment involved
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT repurchase UNIQUE (outlet_id, post_id)
);
