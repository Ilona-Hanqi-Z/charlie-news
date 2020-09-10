INSERT INTO roles (entity, tag, name, scopes) VALUES
    ('client', 'mrss', 'MRSS Keys', '{mrss::}');

INSERT INTO oauth_clients (tag, client_id, client_secret, api_version_id, role_id) VALUES
    (
        'Vemba',
        't7vS9gwHGK6jsT7TStdP4hfH9sRAZpVw',
        '2kCf5dmk5aajSjax8wY9MAAerUN49PhBeaFYfQsVuxwR5y39sTUj8GHNhgRywQS4',
        (SELECT id FROM api_versions ORDER BY version_major DESC, version_minor DESC LIMIT 1),
        (SELECT id FROM roles WHERE entity = 'client' AND tag = 'mrss')
    )