FROM mdillon/postgis:9.5

RUN mkdir -p /usr/src/db
COPY . /usr/src/db

COPY initdb-fresco.sh /docker-entrypoint-initdb.d/z_fresco.sh