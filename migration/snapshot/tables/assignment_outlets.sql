CREATE TABLE assignment_outlets (
    __mongo_assignment_id CHARACTER(24) DEFAULT NULL,
    __mongo_outlet_id CHARACTER(24) DEFAULT NULL,

    assignment_id BIGINT NOT NULL,
    outlet_id BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY(assignment_id, outlet_id)
);