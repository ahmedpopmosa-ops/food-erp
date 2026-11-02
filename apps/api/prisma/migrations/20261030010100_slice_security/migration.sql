-- Phase 3 security and integrity layer: catalog, devices, accounting, sales, sync.
-- See docs/07-accounting-and-inventory-rules.md §1 (invariants) and docs/06-sync-protocol.md.

-- ─── RLS on every new tenant table ─────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tax_rates', 'tax_categories', 'tax_category_rates', 'payment_methods',
    'categories', 'products', 'product_variants', 'product_prices',
    'devices', 'device_tokens',
    'accounts', 'fiscal_years', 'accounting_periods', 'journal_entries', 'journal_lines', 'accounting_mappings', 'document_sequences',
    'orders', 'order_items', 'invoices', 'invoice_lines', 'invoice_taxes', 'payments', 'sale_discrepancies',
    'sync_batches', 'sync_operations', 'idempotency_keys', 'change_log', 'device_sync_state'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      t
    );
  END LOOP;
END
$$;

-- Financial records and ledgers are never deleted by the application (doc 07 I3/I5).
REVOKE DELETE ON TABLE invoices, invoice_lines, invoice_taxes, payments, journal_entries, journal_lines, sync_operations FROM ros_app;

-- ─── Device authentication lookups ─────────────────────────────────────────────
-- Before a device is authenticated its tenant is unknown, so RLS would hide its row. These SECURITY DEFINER
-- functions expose exactly one thing: which device (and tenant) a hash belongs to. Everything after that runs
-- under the normal tenant policies.
CREATE OR REPLACE FUNCTION resolve_device_pairing(p_code_hash text)
  RETURNS TABLE (device_id uuid, tenant_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.tenant_id FROM devices d
  WHERE d.pairing_code_hash = p_code_hash AND d.status = 'pending_pairing' AND d.pairing_expires_at > now()
$$;

CREATE OR REPLACE FUNCTION resolve_device_token(p_token_hash text)
  RETURNS TABLE (device_id uuid, tenant_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.device_id, t.tenant_id FROM device_tokens t WHERE t.token_hash = p_token_hash
$$;

REVOKE ALL ON FUNCTION resolve_device_pairing(text), resolve_device_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_device_pairing(text), resolve_device_token(text) TO ros_app;

-- ─── Same-tenant composite foreign keys ────────────────────────────────────────
CREATE UNIQUE INDEX tax_rates_id_tenant_key ON tax_rates (id, tenant_id);
CREATE UNIQUE INDEX tax_categories_id_tenant_key ON tax_categories (id, tenant_id);
CREATE UNIQUE INDEX payment_methods_id_tenant_key ON payment_methods (id, tenant_id);
CREATE UNIQUE INDEX categories_id_tenant_key ON categories (id, tenant_id);
CREATE UNIQUE INDEX products_id_tenant_key ON products (id, tenant_id);
CREATE UNIQUE INDEX product_variants_id_tenant_key ON product_variants (id, tenant_id);
CREATE UNIQUE INDEX devices_id_tenant_key ON devices (id, tenant_id);
CREATE UNIQUE INDEX accounts_id_tenant_key ON accounts (id, tenant_id);
CREATE UNIQUE INDEX fiscal_years_id_tenant_key ON fiscal_years (id, tenant_id);
CREATE UNIQUE INDEX accounting_periods_id_tenant_key ON accounting_periods (id, tenant_id);
CREATE UNIQUE INDEX journal_entries_id_tenant_key ON journal_entries (id, tenant_id);
CREATE UNIQUE INDEX orders_id_tenant_key ON orders (id, tenant_id);
CREATE UNIQUE INDEX invoices_id_tenant_key ON invoices (id, tenant_id);

ALTER TABLE tax_rates ADD FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE tax_rates ADD FOREIGN KEY (output_account_id, tenant_id) REFERENCES accounts (id, tenant_id);
ALTER TABLE tax_categories ADD FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE tax_category_rates ADD FOREIGN KEY (tax_category_id, tenant_id) REFERENCES tax_categories (id, tenant_id);
ALTER TABLE tax_category_rates ADD FOREIGN KEY (tax_rate_id, tenant_id) REFERENCES tax_rates (id, tenant_id);
ALTER TABLE payment_methods ADD FOREIGN KEY (account_id, tenant_id) REFERENCES accounts (id, tenant_id);
ALTER TABLE categories ADD FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE categories ADD FOREIGN KEY (parent_id, tenant_id) REFERENCES categories (id, tenant_id);
ALTER TABLE products ADD FOREIGN KEY (category_id, tenant_id) REFERENCES categories (id, tenant_id);
ALTER TABLE products ADD FOREIGN KEY (tax_category_id, tenant_id) REFERENCES tax_categories (id, tenant_id);
ALTER TABLE product_variants ADD FOREIGN KEY (product_id, tenant_id) REFERENCES products (id, tenant_id);
ALTER TABLE product_prices ADD FOREIGN KEY (variant_id, tenant_id) REFERENCES product_variants (id, tenant_id);
ALTER TABLE product_prices ADD FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE devices ADD FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE device_tokens ADD FOREIGN KEY (device_id, tenant_id) REFERENCES devices (id, tenant_id) ON DELETE CASCADE;
ALTER TABLE accounts ADD FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE accounts ADD FOREIGN KEY (parent_id, tenant_id) REFERENCES accounts (id, tenant_id);
ALTER TABLE fiscal_years ADD FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE accounting_periods ADD FOREIGN KEY (fiscal_year_id, tenant_id) REFERENCES fiscal_years (id, tenant_id);
ALTER TABLE journal_entries ADD FOREIGN KEY (period_id, tenant_id) REFERENCES accounting_periods (id, tenant_id);
ALTER TABLE journal_entries ADD FOREIGN KEY (reversal_of_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE journal_lines ADD FOREIGN KEY (journal_entry_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE journal_lines ADD FOREIGN KEY (account_id, tenant_id) REFERENCES accounts (id, tenant_id);
ALTER TABLE journal_lines ADD FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE accounting_mappings ADD FOREIGN KEY (account_id, tenant_id) REFERENCES accounts (id, tenant_id);
ALTER TABLE orders ADD FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE orders ADD FOREIGN KEY (device_id, tenant_id) REFERENCES devices (id, tenant_id);
ALTER TABLE order_items ADD FOREIGN KEY (order_id, tenant_id) REFERENCES orders (id, tenant_id);
ALTER TABLE order_items ADD FOREIGN KEY (variant_id, tenant_id) REFERENCES product_variants (id, tenant_id);
ALTER TABLE order_items ADD FOREIGN KEY (tax_category_id, tenant_id) REFERENCES tax_categories (id, tenant_id);
ALTER TABLE invoices ADD FOREIGN KEY (order_id, tenant_id) REFERENCES orders (id, tenant_id);
ALTER TABLE invoices ADD FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE invoices ADD FOREIGN KEY (device_id, tenant_id) REFERENCES devices (id, tenant_id);
ALTER TABLE invoices ADD FOREIGN KEY (journal_entry_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE invoice_lines ADD FOREIGN KEY (invoice_id, tenant_id) REFERENCES invoices (id, tenant_id);
ALTER TABLE invoice_lines ADD FOREIGN KEY (variant_id, tenant_id) REFERENCES product_variants (id, tenant_id);
ALTER TABLE invoice_taxes ADD FOREIGN KEY (invoice_id, tenant_id) REFERENCES invoices (id, tenant_id);
ALTER TABLE invoice_taxes ADD FOREIGN KEY (tax_rate_id, tenant_id) REFERENCES tax_rates (id, tenant_id);
ALTER TABLE payments ADD FOREIGN KEY (invoice_id, tenant_id) REFERENCES invoices (id, tenant_id);
ALTER TABLE payments ADD FOREIGN KEY (payment_method_id, tenant_id) REFERENCES payment_methods (id, tenant_id);
ALTER TABLE payments ADD FOREIGN KEY (journal_entry_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE sale_discrepancies ADD FOREIGN KEY (invoice_id, tenant_id) REFERENCES invoices (id, tenant_id);
ALTER TABLE device_sync_state ADD FOREIGN KEY (device_id, tenant_id) REFERENCES devices (id, tenant_id);

-- ─── CHECK constraints ─────────────────────────────────────────────────────────
ALTER TABLE tax_rates ADD CHECK (rate >= 0 AND rate <= 1);
ALTER TABLE tax_rates ADD CHECK (kind IN ('vat', 'service', 'table_tax', 'other'));
ALTER TABLE tax_rates ADD CHECK (valid_to IS NULL OR valid_to > valid_from);
ALTER TABLE tax_category_rates ADD CHECK (applies_to IN ('sale', 'purchase'));
ALTER TABLE payment_methods ADD CHECK (kind IN ('cash', 'card', 'wallet', 'bank_transfer', 'on_account', 'voucher', 'other'));
ALTER TABLE payment_methods ADD CHECK (NOT allows_change OR kind = 'cash');
ALTER TABLE products ADD CHECK (kind IN ('menu_item', 'resale_item', 'service'));
CREATE UNIQUE INDEX products_tenant_sku_key ON products (tenant_id, sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX product_variants_one_default ON product_variants (product_id) WHERE is_default;
ALTER TABLE product_prices ADD CHECK (price >= 0);
ALTER TABLE product_prices ADD CHECK (channel IS NULL OR channel IN ('dine_in', 'takeaway', 'delivery', 'phone'));
ALTER TABLE product_prices ADD CHECK (valid_to IS NULL OR valid_to > valid_from);
-- No two overlapping price rows for the same variant/branch/channel scope.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE product_prices ADD CONSTRAINT product_prices_no_overlap EXCLUDE USING gist (
  variant_id WITH =,
  (coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
  (coalesce(channel, '*')) WITH =,
  tstzrange(valid_from, coalesce(valid_to, 'infinity'::timestamptz), '[)') WITH &&
);

ALTER TABLE devices ADD CHECK (kind IN ('pos', 'kds'));
ALTER TABLE devices ADD CHECK (status IN ('pending_pairing', 'active', 'disabled', 'retired'));
ALTER TABLE devices ADD CHECK (code ~ '^[A-Z0-9]{2,4}$');
ALTER TABLE device_tokens ADD CHECK (kind IN ('access', 'refresh'));

ALTER TABLE accounts ADD CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense'));
ALTER TABLE accounts ADD CHECK (normal_balance IN ('debit', 'credit'));
ALTER TABLE fiscal_years ADD CHECK (status IN ('open', 'closed'));
ALTER TABLE fiscal_years ADD CHECK (end_date > start_date);
ALTER TABLE accounting_periods ADD CHECK (status IN ('open', 'soft_closed', 'closed'));
ALTER TABLE accounting_periods ADD CHECK (end_date >= start_date);
ALTER TABLE accounting_periods ADD CONSTRAINT accounting_periods_no_overlap
  EXCLUDE USING gist (tenant_id WITH =, daterange(start_date, end_date, '[]') WITH &&);
ALTER TABLE journal_entries ADD CHECK (status IN ('draft', 'posted'));
-- One posting per source document and purpose: retries can never post twice (doc 07 I6).
CREATE UNIQUE INDEX journal_entries_source_once ON journal_entries (tenant_id, source_type, source_id, purpose) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX journal_entries_one_reversal ON journal_entries (reversal_of_id) WHERE reversal_of_id IS NOT NULL;
ALTER TABLE journal_lines ADD CHECK (debit >= 0 AND credit >= 0 AND ((debit > 0) <> (credit > 0)));
ALTER TABLE accounting_mappings ADD CHECK (scope_type IN ('tenant', 'branch', 'category', 'payment_method', 'tax_rate'));
CREATE UNIQUE INDEX accounting_mappings_scope_key ON accounting_mappings
  (tenant_id, mapping_key, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE orders ADD CHECK (channel IN ('dine_in', 'takeaway', 'delivery', 'phone'));
ALTER TABLE orders ADD CHECK (status IN ('open', 'closed', 'cancelled', 'merged'));
ALTER TABLE order_items ADD CHECK (qty > 0);
ALTER TABLE order_items ADD CHECK (status IN ('pending', 'sent', 'voided'));
ALTER TABLE invoices ADD CHECK (status IN ('issued', 'partially_refunded', 'refunded'));
ALTER TABLE invoices ADD CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid'));
ALTER TABLE invoices ADD CHECK (total = subtotal - discount_total + service_charge_total + tax_total + rounding_total);
ALTER TABLE invoices ADD CHECK (refunded_total >= 0 AND refunded_total <= total);
ALTER TABLE invoice_lines ADD CHECK (qty > 0 AND refunded_qty >= 0 AND refunded_qty <= qty);
ALTER TABLE invoice_lines ADD CHECK (gross_amount = net_amount + tax_amount);
ALTER TABLE payments ADD CHECK (amount > 0);
ALTER TABLE payments ADD CHECK (direction IN ('in', 'out'));
ALTER TABLE payments ADD CHECK (change_given IS NULL OR change_given >= 0);
ALTER TABLE sale_discrepancies ADD CHECK (kind IN ('price_outdated', 'product_inactive', 'negative_stock', 'totals_mismatch', 'payment_mismatch', 'late_posting', 'permission_outdated', 'table_conflict'));
ALTER TABLE sale_discrepancies ADD CHECK (status IN ('open', 'acknowledged', 'resolved'));

ALTER TABLE sync_operations ADD CHECK (status IN ('accepted', 'rejected', 'retryable', 'blocked', 'quarantined'));
ALTER TABLE idempotency_keys ADD CHECK (status IN ('in_progress', 'completed'));
ALTER TABLE change_log ADD CHECK (op IN ('upsert', 'delete'));

-- ─── Journal integrity triggers ────────────────────────────────────────────────
-- Entries are written as draft, lines added, then flipped to posted. From then on nothing changes.
CREATE OR REPLACE FUNCTION journal_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN RAISE EXCEPTION 'posted journal entry % cannot be deleted', OLD.number USING ERRCODE = 'check_violation'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'posted journal entry % is immutable; post a reversal instead', OLD.number USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_entry_guard BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION journal_entry_guard();

CREATE OR REPLACE FUNCTION journal_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_entry uuid := coalesce(NEW.journal_entry_id, OLD.journal_entry_id);
BEGIN
  IF (SELECT status FROM journal_entries WHERE id = v_entry) = 'posted' THEN
    RAISE EXCEPTION 'lines of a posted journal entry are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP <> 'DELETE' AND NOT (SELECT is_postable FROM accounts WHERE id = NEW.account_id) THEN
    RAISE EXCEPTION 'account % is a group account and cannot be posted to', NEW.account_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER journal_line_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION journal_line_guard();

-- Deferred to COMMIT so lines can be inserted one by one inside the posting transaction (doc 07 I1).
CREATE OR REPLACE FUNCTION journal_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_debit numeric; v_credit numeric; v_lines int;
BEGIN
  IF NEW.status <> 'posted' THEN RETURN NULL; END IF;
  SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*) INTO v_debit, v_credit, v_lines
    FROM journal_lines WHERE journal_entry_id = NEW.id;
  IF v_lines < 2 OR v_debit <> v_credit OR v_debit = 0 THEN
    RAISE EXCEPTION 'journal entry % is not balanced (debit %, credit %, % lines)', NEW.number, v_debit, v_credit, v_lines
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_entry_balanced AFTER INSERT OR UPDATE ON journal_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_entry_balanced();

-- ─── Finalized sales documents are immutable (doc 07 I5) ───────────────────────
-- Only the listed maintenance columns may change; journal_entry_id only from NULL (set once at posting).
CREATE OR REPLACE FUNCTION immutable_except() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed text[] := TG_ARGV::text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% rows are immutable and cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION '% rows are immutable (only % may change)', TG_TABLE_NAME, allowed USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(OLD) ->> 'journal_entry_id') IS NOT NULL
     AND (to_jsonb(NEW) ->> 'journal_entry_id') IS DISTINCT FROM (to_jsonb(OLD) ->> 'journal_entry_id') THEN
    RAISE EXCEPTION '% journal link cannot be changed once set', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER invoices_immutable BEFORE UPDATE OR DELETE ON invoices FOR EACH ROW
  EXECUTE FUNCTION immutable_except('status', 'paid_total', 'refunded_total', 'payment_status', 'journal_entry_id');
CREATE TRIGGER invoice_lines_immutable BEFORE UPDATE OR DELETE ON invoice_lines FOR EACH ROW
  EXECUTE FUNCTION immutable_except('refunded_qty');
CREATE TRIGGER invoice_taxes_immutable BEFORE UPDATE OR DELETE ON invoice_taxes FOR EACH ROW
  EXECUTE FUNCTION immutable_except();
CREATE TRIGGER payments_immutable BEFORE UPDATE OR DELETE ON payments FOR EACH ROW
  EXECUTE FUNCTION immutable_except('journal_entry_id');

-- ─── Change log for POS pull sync (docs/06 §6) ─────────────────────────────────
CREATE OR REPLACE FUNCTION log_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r jsonb := to_jsonb(coalesce(NEW, OLD));
  v_entity_id uuid := coalesce((r ->> 'id')::uuid, (r ->> 'tenant_id')::uuid);
  v_branch uuid := CASE WHEN TG_ARGV[0] = 'branch' THEN (r ->> 'id')::uuid ELSE (r ->> 'branch_id')::uuid END;
BEGIN
  INSERT INTO change_log (tenant_id, entity_type, entity_id, branch_id, op)
  VALUES ((r ->> 'tenant_id')::uuid, TG_ARGV[0], v_entity_id, v_branch, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END);
  RETURN NULL;
END $$;

DO $$
DECLARE pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ARRAY['branches', 'branch'], ARRAY['tenant_settings', 'tenant_settings'], ARRAY['categories', 'category'],
    ARRAY['products', 'product'], ARRAY['product_variants', 'product_variant'], ARRAY['product_prices', 'product_price'],
    ARRAY['tax_rates', 'tax_rate'], ARRAY['tax_categories', 'tax_category'], ARRAY['tax_category_rates', 'tax_category_rate'],
    ARRAY['payment_methods', 'payment_method']
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION log_change(%L)',
      pair[1], pair[2]
    );
  END LOOP;
END
$$;
