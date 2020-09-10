CREATE TABLE user_identities (
    user_id BIGINT PRIMARY KEY,

    -- ID information
    first_name CHARACTER VARYING(64) DEFAULT NULL,
    last_name CHARACTER VARYING(64) DEFAULT NULL,
    dob_day SMALLINT DEFAULT NULL,
    dob_month SMALLINT DEFAULT NULL,
    dob_year SMALLINT DEFAULT NULL,
    address_line1 CHARACTER VARYING(64) DEFAULT NULL,
    address_line2 CHARACTER VARYING(64) DEFAULT NULL,
    address_zip CHARACTER(5)  DEFAULT NULL,
    address_city CHARACTER VARYING(40) DEFAULT NULL,
    address_state CHARACTER VARYING(2) DEFAULT NULL,
    document_provided BOOLEAN DEFAULT FALSE,
    pid_provided BOOLEAN DEFAULT FALSE, -- SSN (US)
    pid_last4_provided BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    
    -- Verification status
    fields_needed TEXT[] DEFAULT '{}',
    due_by TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    disabled_reason TEXT DEFAULT NULL
);