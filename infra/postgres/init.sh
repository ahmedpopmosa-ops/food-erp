#!/bin/sh
# Runs once when the Docker volume is first created: application role + test database.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE ros_app LOGIN PASSWORD '${PG_APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  CREATE DATABASE restaurant_os_test;
  GRANT CONNECT ON DATABASE restaurant_os TO ros_app;
  GRANT CONNECT ON DATABASE restaurant_os_test TO ros_app;
EOSQL
