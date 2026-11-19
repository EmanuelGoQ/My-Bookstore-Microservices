-- Runs once on first Postgres boot (docker-entrypoint-initdb.d).
-- Creates one database per microservice. For local development all services
-- share the admin login; in EKS each database is a separate RDS instance with
-- its own least-privilege role (see common/bootstrap.sh).
CREATE DATABASE catalog;
CREATE DATABASE users;
CREATE DATABASE orders;
CREATE DATABASE carts;
CREATE DATABASE wishlists;
CREATE DATABASE reviews;
