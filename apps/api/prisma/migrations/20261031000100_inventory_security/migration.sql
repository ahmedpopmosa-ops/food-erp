-- Phase 5a integrity: inventory items, recipes, stock ledger, adjustments, counts, transfers.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_items', 'recipes', 'recipe_versions', 'recipe_lines', 'stock_movements', 'stock_balances',
    'stock_adjustments', 'stock_adjustment_lines', 'stock_counts', 'stock_count_lines', 'stock_transfers', 'stock_transfer_lines'
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

-- The stock ledger is append-only (doc 07 I3/I8): corrections are new movements.
REVOKE UPDATE, DELETE ON TABLE stock_movements FROM ros_app;
REVOKE DELETE ON TABLE recipe_versions, recipe_lines, stock_adjustments, stock_adjustment_lines FROM ros_app;

CREATE UNIQUE INDEX inventory_items_id_tenant_key ON inventory_items (id, tenant_id);
CREATE UNIQUE INDEX recipes_id_tenant_key ON recipes (id, tenant_id);
CREATE UNIQUE INDEX recipe_versions_id_tenant_key ON recipe_versions (id, tenant_id);
CREATE UNIQUE INDEX warehouses_id_tenant_key ON warehouses (id, tenant_id);
CREATE UNIQUE INDEX stock_adjustments_id_tenant_key ON stock_adjustments (id, tenant_id);
CREATE UNIQUE INDEX stock_counts_id_tenant_key ON stock_counts (id, tenant_id);
CREATE UNIQUE INDEX stock_transfers_id_tenant_key ON stock_transfers (id, tenant_id);

ALTER TABLE inventory_items ADD FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE recipes ADD FOREIGN KEY (variant_id, tenant_id) REFERENCES product_variants (id, tenant_id);
ALTER TABLE recipe_versions ADD FOREIGN KEY (recipe_id, tenant_id) REFERENCES recipes (id, tenant_id);
ALTER TABLE recipe_lines ADD FOREIGN KEY (recipe_version_id, tenant_id) REFERENCES recipe_versions (id, tenant_id);
ALTER TABLE recipe_lines ADD FOREIGN KEY (item_id, tenant_id) REFERENCES inventory_items (id, tenant_id);
ALTER TABLE stock_movements ADD FOREIGN KEY (warehouse_id, tenant_id) REFERENCES warehouses (id, tenant_id);
ALTER TABLE stock_movements ADD FOREIGN KEY (item_id, tenant_id) REFERENCES inventory_items (id, tenant_id);
ALTER TABLE stock_movements ADD FOREIGN KEY (journal_entry_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE stock_balances ADD FOREIGN KEY (warehouse_id, tenant_id) REFERENCES warehouses (id, tenant_id);
ALTER TABLE stock_balances ADD FOREIGN KEY (item_id, tenant_id) REFERENCES inventory_items (id, tenant_id);
ALTER TABLE stock_adjustments ADD FOREIGN KEY (warehouse_id, tenant_id) REFERENCES warehouses (id, tenant_id);
ALTER TABLE stock_adjustments ADD FOREIGN KEY (journal_entry_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE stock_adjustment_lines ADD FOREIGN KEY (adjustment_id, tenant_id) REFERENCES stock_adjustments (id, tenant_id);
ALTER TABLE stock_adjustment_lines ADD FOREIGN KEY (item_id, tenant_id) REFERENCES inventory_items (id, tenant_id);
ALTER TABLE stock_counts ADD FOREIGN KEY (warehouse_id, tenant_id) REFERENCES warehouses (id, tenant_id);
ALTER TABLE stock_count_lines ADD FOREIGN KEY (count_id, tenant_id) REFERENCES stock_counts (id, tenant_id);
ALTER TABLE stock_count_lines ADD FOREIGN KEY (item_id, tenant_id) REFERENCES inventory_items (id, tenant_id);
ALTER TABLE stock_transfers ADD FOREIGN KEY (from_warehouse_id, tenant_id) REFERENCES warehouses (id, tenant_id);
ALTER TABLE stock_transfers ADD FOREIGN KEY (to_warehouse_id, tenant_id) REFERENCES warehouses (id, tenant_id);
ALTER TABLE stock_transfer_lines ADD FOREIGN KEY (transfer_id, tenant_id) REFERENCES stock_transfers (id, tenant_id);
ALTER TABLE stock_transfer_lines ADD FOREIGN KEY (item_id, tenant_id) REFERENCES inventory_items (id, tenant_id);
ALTER TABLE invoice_lines ADD FOREIGN KEY (recipe_version_id, tenant_id) REFERENCES recipe_versions (id, tenant_id);

ALTER TABLE inventory_items ADD CHECK (kind IN ('ingredient', 'semi_finished', 'resale', 'packaging', 'consumable'));
ALTER TABLE inventory_items ADD CHECK (base_unit IN ('g', 'ml', 'pc'));
ALTER TABLE inventory_items ADD CHECK (standard_cost >= 0);
ALTER TABLE recipe_versions ADD CHECK (status IN ('active', 'retired') AND yield_qty > 0);
CREATE UNIQUE INDEX recipe_versions_one_active ON recipe_versions (recipe_id) WHERE status = 'active';
ALTER TABLE recipe_lines ADD CHECK (qty > 0 AND qty_base > 0 AND waste_pct >= 0 AND waste_pct < 1);

ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_sign_check CHECK (
  (movement_type IN ('opening_balance', 'adjustment_in', 'count_gain', 'transfer_in', 'purchase_receipt', 'refund_return', 'production_output') AND qty_base > 0 AND total_cost >= 0)
  OR (movement_type IN ('sale_consumption', 'wastage', 'spoilage', 'adjustment_out', 'count_loss', 'transfer_out', 'transfer_variance', 'supplier_return', 'production_consume') AND qty_base < 0 AND total_cost <= 0)
  OR (movement_type = 'revaluation' AND qty_base = 0)
);
-- One effect per source line, item, warehouse and type: a retried posting can never move stock twice (doc 07 I6).
CREATE UNIQUE INDEX stock_movements_source_once ON stock_movements (tenant_id, source_type, source_id, coalesce(source_line_id, source_id), movement_type, item_id, warehouse_id);

ALTER TABLE stock_adjustments ADD CHECK (kind IN ('opening_balance', 'adjustment', 'wastage', 'spoilage') AND status = 'posted');
ALTER TABLE stock_counts ADD CHECK (status IN ('in_progress', 'approved', 'cancelled'));
ALTER TABLE stock_transfers ADD CHECK (status IN ('draft', 'dispatched', 'received', 'cancelled') AND from_warehouse_id <> to_warehouse_id);
ALTER TABLE stock_transfer_lines ADD CHECK (qty_sent > 0 AND (qty_received IS NULL OR qty_received >= 0));

CREATE TRIGGER recipe_versions_immutable BEFORE UPDATE OR DELETE ON recipe_versions FOR EACH ROW EXECUTE FUNCTION immutable_except('status');
CREATE TRIGGER recipe_lines_immutable BEFORE UPDATE OR DELETE ON recipe_lines FOR EACH ROW EXECUTE FUNCTION immutable_except();
CREATE TRIGGER stock_adjustments_immutable BEFORE UPDATE OR DELETE ON stock_adjustments FOR EACH ROW EXECUTE FUNCTION immutable_except('journal_entry_id');
CREATE TRIGGER stock_adjustment_lines_immutable BEFORE UPDATE OR DELETE ON stock_adjustment_lines FOR EACH ROW EXECUTE FUNCTION immutable_except();
