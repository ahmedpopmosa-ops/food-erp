-- Backfill the pull feed for staff created before the employee/role change_log triggers existed
-- (20261030020100). Without this, devices of older tenants never receive roles, so operators sign in
-- with no permissions. Upserts are idempotent on the device, so re-logging current rows is safe.
INSERT INTO change_log (tenant_id, entity_type, entity_id, branch_id, op)
SELECT tenant_id, 'role', id, NULL, 'upsert' FROM roles;

INSERT INTO change_log (tenant_id, entity_type, entity_id, branch_id, op)
SELECT tenant_id, 'employee', id, NULL, 'upsert' FROM employees;
