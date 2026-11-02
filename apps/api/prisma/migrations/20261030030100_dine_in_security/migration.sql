-- Phase 4b security and integrity: modifiers, floor plan, order/line extensions.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['modifier_groups', 'modifiers', 'product_modifier_groups', 'service_areas', 'dining_tables'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      t
    );
  END LOOP;
END
$$;

CREATE UNIQUE INDEX modifier_groups_id_tenant_key ON modifier_groups (id, tenant_id);
CREATE UNIQUE INDEX service_areas_id_tenant_key ON service_areas (id, tenant_id);
CREATE UNIQUE INDEX dining_tables_id_tenant_key ON dining_tables (id, tenant_id);

ALTER TABLE modifier_groups ADD FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE modifiers ADD FOREIGN KEY (group_id, tenant_id) REFERENCES modifier_groups (id, tenant_id);
ALTER TABLE product_modifier_groups ADD FOREIGN KEY (product_id, tenant_id) REFERENCES products (id, tenant_id) ON DELETE CASCADE;
ALTER TABLE product_modifier_groups ADD FOREIGN KEY (group_id, tenant_id) REFERENCES modifier_groups (id, tenant_id);
ALTER TABLE service_areas ADD FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE dining_tables ADD FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
ALTER TABLE dining_tables ADD FOREIGN KEY (service_area_id, tenant_id) REFERENCES service_areas (id, tenant_id);
ALTER TABLE orders ADD FOREIGN KEY (table_id, tenant_id) REFERENCES dining_tables (id, tenant_id);
ALTER TABLE orders ADD FOREIGN KEY (employee_id, tenant_id) REFERENCES employees (id, tenant_id);
ALTER TABLE order_items ADD FOREIGN KEY (void_approval_id, tenant_id) REFERENCES approvals (id, tenant_id);
ALTER TABLE tenant_settings ADD FOREIGN KEY (service_charge_tax_category_id) REFERENCES tax_categories (id);

ALTER TABLE modifier_groups ADD CHECK (min_select >= 0 AND max_select >= 1 AND min_select <= max_select);
ALTER TABLE dining_tables ADD CHECK (seats BETWEEN 1 AND 50);
ALTER TABLE orders ADD CHECK (guests IS NULL OR guests BETWEEN 1 AND 200);
ALTER TABLE orders ADD CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL);
ALTER TABLE invoice_lines ADD CHECK (discount_amount >= 0);
ALTER TABLE tenant_settings ADD CHECK (service_charge_rate >= 0 AND service_charge_rate < 1);
ALTER TABLE tenant_settings ADD CHECK (max_discount_pct >= 0 AND max_discount_pct <= 1);
ALTER TABLE sale_discrepancies DROP CONSTRAINT IF EXISTS sale_discrepancies_kind_check;
ALTER TABLE sale_discrepancies ADD CONSTRAINT sale_discrepancies_kind_check CHECK (kind IN (
  'price_outdated', 'product_inactive', 'negative_stock', 'totals_mismatch', 'payment_mismatch', 'late_posting',
  'permission_outdated', 'table_conflict', 'cash_expected_mismatch', 'refund_mismatch', 'discount_unapproved'));

-- Pull feed for the POS.
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON modifier_groups FOR EACH ROW EXECUTE FUNCTION log_change('modifier_group');
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON modifiers FOR EACH ROW EXECUTE FUNCTION log_change('modifier');
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON product_modifier_groups FOR EACH ROW EXECUTE FUNCTION log_change('product_modifier_group');
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON service_areas FOR EACH ROW EXECUTE FUNCTION log_change('service_area');
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON dining_tables FOR EACH ROW EXECUTE FUNCTION log_change('dining_table');
