-- Phase 4a security and integrity: employees, approvals, cash sessions, refunds.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employees', 'employee_branches', 'approvals', 'cash_sessions', 'cash_movements', 'refunds', 'refund_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      t
    );
  END LOOP;
END
$$;

REVOKE DELETE ON TABLE approvals, cash_sessions, cash_movements, refunds, refund_lines FROM ros_app;

-- ─── Same-tenant composite foreign keys ────────────────────────────────────────
CREATE UNIQUE INDEX employees_id_tenant_key ON employees (id, tenant_id);
CREATE UNIQUE INDEX cash_sessions_id_tenant_key ON cash_sessions (id, tenant_id);
CREATE UNIQUE INDEX refunds_id_tenant_key ON refunds (id, tenant_id);
CREATE UNIQUE INDEX approvals_id_tenant_key ON approvals (id, tenant_id);
CREATE UNIQUE INDEX invoice_lines_id_tenant_key ON invoice_lines (id, tenant_id);

ALTER TABLE employees ADD FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE employees ADD FOREIGN KEY (role_id, tenant_id) REFERENCES roles (id, tenant_id);
ALTER TABLE employee_branches ADD FOREIGN KEY (employee_id, tenant_id) REFERENCES employees (id, tenant_id) ON DELETE CASCADE;
ALTER TABLE employee_branches ADD FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE approvals ADD FOREIGN KEY (approver_employee_id, tenant_id) REFERENCES employees (id, tenant_id);
ALTER TABLE approvals ADD FOREIGN KEY (device_id, tenant_id) REFERENCES devices (id, tenant_id);
ALTER TABLE cash_sessions ADD FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE cash_sessions ADD FOREIGN KEY (device_id, tenant_id) REFERENCES devices (id, tenant_id);
ALTER TABLE cash_sessions ADD FOREIGN KEY (employee_id, tenant_id) REFERENCES employees (id, tenant_id);
ALTER TABLE cash_sessions ADD FOREIGN KEY (journal_entry_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE cash_movements ADD FOREIGN KEY (cash_session_id, tenant_id) REFERENCES cash_sessions (id, tenant_id);
ALTER TABLE cash_movements ADD FOREIGN KEY (employee_id, tenant_id) REFERENCES employees (id, tenant_id);
ALTER TABLE cash_movements ADD FOREIGN KEY (approval_id, tenant_id) REFERENCES approvals (id, tenant_id);
ALTER TABLE cash_movements ADD FOREIGN KEY (journal_entry_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE refunds ADD FOREIGN KEY (invoice_id, tenant_id) REFERENCES invoices (id, tenant_id);
ALTER TABLE refunds ADD FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE refunds ADD FOREIGN KEY (device_id, tenant_id) REFERENCES devices (id, tenant_id);
ALTER TABLE refunds ADD FOREIGN KEY (employee_id, tenant_id) REFERENCES employees (id, tenant_id);
ALTER TABLE refunds ADD FOREIGN KEY (cash_session_id, tenant_id) REFERENCES cash_sessions (id, tenant_id);
ALTER TABLE refunds ADD FOREIGN KEY (approval_id, tenant_id) REFERENCES approvals (id, tenant_id);
ALTER TABLE refunds ADD FOREIGN KEY (journal_entry_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE refund_lines ADD FOREIGN KEY (refund_id, tenant_id) REFERENCES refunds (id, tenant_id);
ALTER TABLE refund_lines ADD FOREIGN KEY (invoice_line_id, tenant_id) REFERENCES invoice_lines (id, tenant_id);
ALTER TABLE payments ADD FOREIGN KEY (cash_session_id, tenant_id) REFERENCES cash_sessions (id, tenant_id);
ALTER TABLE payments ADD FOREIGN KEY (refund_id, tenant_id) REFERENCES refunds (id, tenant_id);
ALTER TABLE invoices ADD FOREIGN KEY (employee_id, tenant_id) REFERENCES employees (id, tenant_id);
ALTER TABLE invoices ADD FOREIGN KEY (cash_session_id, tenant_id) REFERENCES cash_sessions (id, tenant_id);

-- ─── CHECK constraints ─────────────────────────────────────────────────────────
ALTER TABLE employees ADD CHECK (status IN ('active', 'suspended', 'terminated'));
ALTER TABLE employees ADD CHECK (pos_pin_hash IS NULL OR pos_pin_hash LIKE 'pbkdf2-sha256$%');
ALTER TABLE approvals ADD CHECK (method IN ('pin', 'online'));
ALTER TABLE cash_sessions ADD CHECK (status IN ('open', 'closed'));
ALTER TABLE cash_sessions ADD CHECK (opening_float >= 0);
ALTER TABLE cash_sessions ADD CHECK (status = 'open' OR (closed_at IS NOT NULL AND counted_cash IS NOT NULL AND expected_cash IS NOT NULL));
CREATE UNIQUE INDEX cash_sessions_one_open_per_device ON cash_sessions (device_id) WHERE status = 'open';
ALTER TABLE cash_movements ADD CHECK (kind IN ('pay_in', 'pay_out'));
ALTER TABLE cash_movements ADD CHECK (amount > 0);
ALTER TABLE refunds ADD CHECK (total = net_total + tax_total AND total > 0);
ALTER TABLE refund_lines ADD CHECK (qty > 0 AND gross_amount = net_amount + tax_amount);
-- Payments go in for sales and out for refunds.
ALTER TABLE payments ADD CHECK ((direction = 'out') = (refund_id IS NOT NULL));
ALTER TABLE sale_discrepancies DROP CONSTRAINT IF EXISTS sale_discrepancies_kind_check;
ALTER TABLE sale_discrepancies ADD CONSTRAINT sale_discrepancies_kind_check CHECK (kind IN (
  'price_outdated', 'product_inactive', 'negative_stock', 'totals_mismatch', 'payment_mismatch', 'late_posting',
  'permission_outdated', 'table_conflict', 'cash_expected_mismatch', 'refund_mismatch'));

-- ─── Immutability ──────────────────────────────────────────────────────────────
CREATE TRIGGER refunds_immutable BEFORE UPDATE OR DELETE ON refunds FOR EACH ROW EXECUTE FUNCTION immutable_except('journal_entry_id');
CREATE TRIGGER refund_lines_immutable BEFORE UPDATE OR DELETE ON refund_lines FOR EACH ROW EXECUTE FUNCTION immutable_except();
CREATE TRIGGER cash_movements_immutable BEFORE UPDATE OR DELETE ON cash_movements FOR EACH ROW EXECUTE FUNCTION immutable_except('journal_entry_id');
CREATE TRIGGER approvals_immutable BEFORE UPDATE OR DELETE ON approvals FOR EACH ROW EXECUTE FUNCTION immutable_except();

-- A closed cash session never changes; an open one may only be closed.
CREATE OR REPLACE FUNCTION cash_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'closed cash session % is immutable', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'closed_at', 'closed_by', 'expected_cash', 'device_expected_cash', 'counted_cash', 'variance', 'counted_breakdown', 'journal_entry_id', 'closed_operation_id'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status', 'closed_at', 'closed_by', 'expected_cash', 'device_expected_cash', 'counted_cash', 'variance', 'counted_breakdown', 'journal_entry_id', 'closed_operation_id']) THEN
    RAISE EXCEPTION 'only closing fields of a cash session may change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cash_session_guard BEFORE UPDATE ON cash_sessions FOR EACH ROW EXECUTE FUNCTION cash_session_guard();

-- ─── Pull feed for employees (PIN hashes + POS role) and roles ─────────────────
-- log_change(entity [, id column]): the id column defaults to `id`.
CREATE OR REPLACE FUNCTION log_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r jsonb := to_jsonb(coalesce(NEW, OLD));
  v_id_col text := coalesce(TG_ARGV[1], 'id');
  v_entity_id uuid := coalesce((r ->> v_id_col)::uuid, (r ->> 'tenant_id')::uuid);
  v_branch uuid := CASE WHEN TG_ARGV[0] = 'branch' THEN (r ->> 'id')::uuid ELSE (r ->> 'branch_id')::uuid END;
BEGIN
  INSERT INTO change_log (tenant_id, entity_type, entity_id, branch_id, op)
  VALUES ((r ->> 'tenant_id')::uuid, TG_ARGV[0], v_entity_id, v_branch, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END);
  RETURN NULL;
END $$;

CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON employees FOR EACH ROW EXECUTE FUNCTION log_change('employee');
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON employee_branches FOR EACH ROW EXECUTE FUNCTION log_change('employee', 'employee_id');
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON roles FOR EACH ROW EXECUTE FUNCTION log_change('role');
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON role_permissions FOR EACH ROW EXECUTE FUNCTION log_change('role', 'role_id');
