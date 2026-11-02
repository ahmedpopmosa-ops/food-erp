-- Security layer for Phase 2 (ADR-0002, doc 05 §4).
-- The API and worker connect as `ros_app` (NOSUPERUSER, NOBYPASSRLS). Migrations run as the owner.
-- Every tenant transaction sets app.tenant_id with set_config(..., true) — transaction-local, so it is safe
-- with pooled connections (PgBouncer transaction mode). See PrismaService.withTenant().

-- ─── Application role and grants ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ros_app') THEN
    CREATE ROLE ros_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO ros_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ros_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ros_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ros_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ros_app;
REVOKE ALL ON TABLE "_prisma_migrations" FROM ros_app;

-- Permission catalog is owned by the code (packages/contracts) and synced by the owner role.
REVOKE INSERT, UPDATE, DELETE ON TABLE permissions FROM ros_app;
-- Audit trails are append-only for the application.
REVOKE UPDATE, DELETE ON TABLE audit_logs FROM ros_app;
REVOKE UPDATE, DELETE ON TABLE platform_audit_logs FROM ros_app;

-- ─── Context functions ─────────────────────────────────────────────────────────
-- Each returns NULL when the setting is absent, so policies match no rows instead of erroring.
CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_is_platform() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.platform', true), '') = 'on' $$;

-- ─── Strict tenant isolation ───────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles', 'role_permissions', 'membership_branches', 'audit_logs', 'tenant_settings', 'branches', 'warehouses'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      t
    );
  END LOOP;
END
$$;

-- Memberships: visible to the active tenant, and to the signed-in user for their own rows (tenant picker).
-- Writes only within the active tenant.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON memberships
  USING (tenant_id = app_tenant_id() OR user_id = app_user_id())
  WITH CHECK (tenant_id = app_tenant_id());

-- Tenants: own tenant, tenants the signed-in user belongs to, or the platform context.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_visibility ON tenants
  USING (
    id = app_tenant_id()
    OR app_is_platform()
    OR EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = tenants.id AND m.user_id = app_user_id())
  )
  WITH CHECK (app_is_platform());

-- Subscriptions: readable by the tenant, written only by the platform.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_read ON subscriptions FOR SELECT USING (tenant_id = app_tenant_id() OR app_is_platform());
CREATE POLICY subscription_write ON subscriptions FOR ALL USING (app_is_platform()) WITH CHECK (app_is_platform());

-- Plans are public reference data; only the platform may change them.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plans', 'plan_entitlements'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY plan_read ON %I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY plan_write ON %I FOR ALL USING (app_is_platform()) WITH CHECK (app_is_platform())', t);
  END LOOP;
END
$$;

-- Operator tables are invisible outside the platform context.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_users', 'platform_sessions', 'platform_audit_logs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY platform_only ON %I USING (app_is_platform()) WITH CHECK (app_is_platform())', t);
  END LOOP;
END
$$;
-- users, sessions, password_reset_tokens: global identity, no tenant column; accessed by token hash or email only.

-- ─── Same-tenant composite foreign keys ────────────────────────────────────────
-- A child row can never reference another tenant's parent, even if application code is wrong.
CREATE UNIQUE INDEX roles_id_tenant_key ON roles (id, tenant_id);
CREATE UNIQUE INDEX memberships_id_tenant_key ON memberships (id, tenant_id);
CREATE UNIQUE INDEX branches_id_tenant_key ON branches (id, tenant_id);

ALTER TABLE role_permissions
  ADD CONSTRAINT role_permissions_role_same_tenant_fkey
  FOREIGN KEY (role_id, tenant_id) REFERENCES roles (id, tenant_id) ON DELETE CASCADE;
ALTER TABLE memberships
  ADD CONSTRAINT memberships_role_same_tenant_fkey
  FOREIGN KEY (role_id, tenant_id) REFERENCES roles (id, tenant_id);
ALTER TABLE membership_branches
  ADD CONSTRAINT membership_branches_membership_same_tenant_fkey
  FOREIGN KEY (membership_id, tenant_id) REFERENCES memberships (id, tenant_id) ON DELETE CASCADE;
ALTER TABLE membership_branches
  ADD CONSTRAINT membership_branches_branch_same_tenant_fkey
  FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE warehouses
  ADD CONSTRAINT warehouses_branch_same_tenant_fkey
  FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE roles ADD CONSTRAINT roles_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE sessions ADD CONSTRAINT sessions_active_tenant_fkey FOREIGN KEY (active_tenant_id) REFERENCES tenants (id);

-- ─── CHECK constraints and partial uniques ─────────────────────────────────────
ALTER TABLE plans ADD CONSTRAINT plans_billing_interval_check CHECK (billing_interval IN ('month', 'year'));
ALTER TABLE plans ADD CONSTRAINT plans_price_check CHECK (price >= 0);
ALTER TABLE plans ADD CONSTRAINT plans_trial_days_check CHECK (trial_days >= 0);
ALTER TABLE plan_entitlements ADD CONSTRAINT plan_entitlements_limit_check CHECK (limit_value IS NULL OR limit_value >= 0);

ALTER TABLE tenants ADD CONSTRAINT tenants_status_check CHECK (status IN ('onboarding', 'active', 'suspended', 'closed'));
ALTER TABLE tenants ADD CONSTRAINT tenants_slug_check CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
ALTER TABLE tenants ADD CONSTRAINT tenants_currency_check CHECK (base_currency ~ '^[A-Z]{3}$');
ALTER TABLE tenants ADD CONSTRAINT tenants_country_check CHECK (country_code ~ '^[A-Z]{2}$');

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trialing', 'active', 'past_due', 'grace', 'suspended', 'cancelled', 'expired'));
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_period_check CHECK (current_period_end > current_period_start);
-- One live subscription per tenant.
CREATE UNIQUE INDEX subscriptions_one_live_per_tenant ON subscriptions (tenant_id)
  WHERE status IN ('trialing', 'active', 'past_due', 'grace', 'suspended');

ALTER TABLE platform_users ADD CONSTRAINT platform_users_role_check CHECK (role IN ('owner', 'support', 'billing', 'readonly'));
ALTER TABLE platform_users ADD CONSTRAINT platform_users_email_lower_check CHECK (email = lower(email));
ALTER TABLE users ADD CONSTRAINT users_email_lower_check CHECK (email = lower(email));
ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_purpose_check CHECK (purpose IN ('reset', 'invite'));

ALTER TABLE memberships ADD CONSTRAINT memberships_status_check CHECK (status IN ('invited', 'active', 'disabled'));
CREATE UNIQUE INDEX roles_tenant_name_ci_key ON roles (tenant_id, lower(name));
CREATE UNIQUE INDEX roles_one_template_per_tenant ON roles (tenant_id, template_key) WHERE template_key IS NOT NULL;

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_type_check
  CHECK (actor_type IN ('user', 'employee', 'device', 'system', 'support', 'platform'));

ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_tax_rounding_check CHECK (tax_rounding IN ('line', 'document'));
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_valuation_check CHECK (valuation_method IN ('weighted_average', 'fifo'));
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_posting_check CHECK (posting_granularity IN ('per_document', 'daily_summary'));
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_cutoff_check CHECK (business_day_cutoff ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_lease_days_check CHECK (lease_days BETWEEN 1 AND 30);

ALTER TABLE branches ADD CONSTRAINT branches_code_check CHECK (code ~ '^[A-Z0-9]{2,6}$');
ALTER TABLE branches ADD CONSTRAINT branches_status_check CHECK (status IN ('active', 'closed'));
ALTER TABLE branches ADD CONSTRAINT branches_currency_check CHECK (currency_code ~ '^[A-Z]{3}$');
ALTER TABLE warehouses ADD CONSTRAINT warehouses_kind_check CHECK (kind IN ('main', 'kitchen', 'bar', 'transit'));
ALTER TABLE warehouses ADD CONSTRAINT warehouses_transit_no_branch_check CHECK ((kind = 'transit') = (branch_id IS NULL));

-- Branch currency must equal the tenant base currency in the MVP (doc 01 A5).
CREATE OR REPLACE FUNCTION branches_currency_matches_tenant() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.currency_code <> (SELECT base_currency FROM tenants WHERE id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'branch currency % differs from tenant base currency', NEW.currency_code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER branches_currency_matches_tenant
  BEFORE INSERT OR UPDATE OF currency_code ON branches
  FOR EACH ROW EXECUTE FUNCTION branches_currency_matches_tenant();
