-- Phase 5b integrity: suppliers, purchase orders, goods receipts, supplier invoices, payments and returns.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'suppliers', 'purchase_orders', 'purchase_order_lines', 'goods_receipts', 'goods_receipt_lines',
    'supplier_invoices', 'supplier_invoice_lines', 'supplier_payments', 'supplier_payment_allocations',
    'supplier_returns', 'supplier_return_lines'
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

-- Posted documents are never deleted; corrections are new documents (doc 07 I3).
REVOKE DELETE ON TABLE purchase_order_lines, goods_receipts, goods_receipt_lines, supplier_invoices, supplier_invoice_lines,
  supplier_payments, supplier_payment_allocations, supplier_returns, supplier_return_lines FROM ros_app;

CREATE UNIQUE INDEX suppliers_id_tenant_key ON suppliers (id, tenant_id);
CREATE UNIQUE INDEX purchase_orders_id_tenant_key ON purchase_orders (id, tenant_id);
CREATE UNIQUE INDEX purchase_order_lines_id_tenant_key ON purchase_order_lines (id, tenant_id);
CREATE UNIQUE INDEX goods_receipts_id_tenant_key ON goods_receipts (id, tenant_id);
CREATE UNIQUE INDEX goods_receipt_lines_id_tenant_key ON goods_receipt_lines (id, tenant_id);
CREATE UNIQUE INDEX supplier_invoices_id_tenant_key ON supplier_invoices (id, tenant_id);
CREATE UNIQUE INDEX supplier_payments_id_tenant_key ON supplier_payments (id, tenant_id);
CREATE UNIQUE INDEX supplier_returns_id_tenant_key ON supplier_returns (id, tenant_id);

ALTER TABLE suppliers ADD FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE purchase_orders ADD FOREIGN KEY (supplier_id, tenant_id) REFERENCES suppliers (id, tenant_id);
ALTER TABLE purchase_orders ADD FOREIGN KEY (warehouse_id, tenant_id) REFERENCES warehouses (id, tenant_id);
ALTER TABLE purchase_order_lines ADD FOREIGN KEY (order_id, tenant_id) REFERENCES purchase_orders (id, tenant_id);
ALTER TABLE purchase_order_lines ADD FOREIGN KEY (item_id, tenant_id) REFERENCES inventory_items (id, tenant_id);
ALTER TABLE goods_receipts ADD FOREIGN KEY (supplier_id, tenant_id) REFERENCES suppliers (id, tenant_id);
ALTER TABLE goods_receipts ADD FOREIGN KEY (order_id, tenant_id) REFERENCES purchase_orders (id, tenant_id);
ALTER TABLE goods_receipts ADD FOREIGN KEY (warehouse_id, tenant_id) REFERENCES warehouses (id, tenant_id);
ALTER TABLE goods_receipts ADD FOREIGN KEY (journal_entry_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE goods_receipt_lines ADD FOREIGN KEY (receipt_id, tenant_id) REFERENCES goods_receipts (id, tenant_id);
ALTER TABLE goods_receipt_lines ADD FOREIGN KEY (order_line_id, tenant_id) REFERENCES purchase_order_lines (id, tenant_id);
ALTER TABLE goods_receipt_lines ADD FOREIGN KEY (item_id, tenant_id) REFERENCES inventory_items (id, tenant_id);
ALTER TABLE supplier_invoices ADD FOREIGN KEY (supplier_id, tenant_id) REFERENCES suppliers (id, tenant_id);
ALTER TABLE supplier_invoices ADD FOREIGN KEY (journal_entry_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE supplier_invoice_lines ADD FOREIGN KEY (invoice_id, tenant_id) REFERENCES supplier_invoices (id, tenant_id);
ALTER TABLE supplier_invoice_lines ADD FOREIGN KEY (receipt_line_id, tenant_id) REFERENCES goods_receipt_lines (id, tenant_id);
ALTER TABLE supplier_invoice_lines ADD FOREIGN KEY (account_id, tenant_id) REFERENCES accounts (id, tenant_id);
ALTER TABLE supplier_payments ADD FOREIGN KEY (supplier_id, tenant_id) REFERENCES suppliers (id, tenant_id);
ALTER TABLE supplier_payments ADD FOREIGN KEY (journal_entry_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE supplier_payment_allocations ADD FOREIGN KEY (payment_id, tenant_id) REFERENCES supplier_payments (id, tenant_id);
ALTER TABLE supplier_payment_allocations ADD FOREIGN KEY (invoice_id, tenant_id) REFERENCES supplier_invoices (id, tenant_id);
ALTER TABLE supplier_returns ADD FOREIGN KEY (supplier_id, tenant_id) REFERENCES suppliers (id, tenant_id);
ALTER TABLE supplier_returns ADD FOREIGN KEY (receipt_id, tenant_id) REFERENCES goods_receipts (id, tenant_id);
ALTER TABLE supplier_returns ADD FOREIGN KEY (warehouse_id, tenant_id) REFERENCES warehouses (id, tenant_id);
ALTER TABLE supplier_returns ADD FOREIGN KEY (journal_entry_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE supplier_return_lines ADD FOREIGN KEY (return_id, tenant_id) REFERENCES supplier_returns (id, tenant_id);
ALTER TABLE supplier_return_lines ADD FOREIGN KEY (receipt_line_id, tenant_id) REFERENCES goods_receipt_lines (id, tenant_id);
ALTER TABLE supplier_return_lines ADD FOREIGN KEY (item_id, tenant_id) REFERENCES inventory_items (id, tenant_id);

ALTER TABLE suppliers ADD CHECK (payment_terms_days BETWEEN 0 AND 365);
ALTER TABLE purchase_orders ADD CHECK (status IN ('draft', 'approved', 'partially_received', 'received', 'cancelled') AND total >= 0);
ALTER TABLE purchase_order_lines ADD CHECK (qty > 0 AND qty_base > 0 AND unit_price >= 0 AND qty_received_base BETWEEN 0 AND qty_base);
ALTER TABLE goods_receipts ADD CHECK (goods_total >= 0 AND charges_total >= 0);
-- A receipt line is never invoiced or returned beyond what arrived, and never clears more than its goods value.
ALTER TABLE goods_receipt_lines ADD CHECK (
  qty > 0 AND qty_base > 0 AND unit_price >= 0 AND goods_value >= 0 AND charges_value >= 0
  AND qty_invoiced_base >= 0 AND qty_returned_base >= 0 AND qty_invoiced_base + qty_returned_base <= qty_base
  AND value_cleared BETWEEN 0 AND goods_value
);
ALTER TABLE supplier_invoices ADD CHECK (
  status IN ('open', 'paid') AND subtotal >= 0 AND tax_total >= 0 AND total = subtotal + tax_total
  AND amount_paid BETWEEN 0 AND total AND (status = 'paid') = (amount_paid = total) AND due_date >= invoice_date
);
ALTER TABLE supplier_invoice_lines ADD CHECK (
  amount >= 0 AND tax_amount >= 0 AND ((receipt_line_id IS NOT NULL AND qty_base > 0) OR (receipt_line_id IS NULL AND account_id IS NOT NULL))
);
ALTER TABLE supplier_payments ADD CHECK (method IN ('cash', 'bank') AND amount > 0);
ALTER TABLE supplier_payment_allocations ADD CHECK (amount > 0);
ALTER TABLE supplier_return_lines ADD CHECK (qty > 0 AND qty_base > 0 AND grni_value >= 0 AND stock_value >= 0);

-- Posted documents change only in their running totals and journal links.
CREATE TRIGGER purchase_order_lines_immutable BEFORE UPDATE OR DELETE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION immutable_except('qty_received_base');
CREATE TRIGGER goods_receipts_immutable BEFORE UPDATE OR DELETE ON goods_receipts FOR EACH ROW EXECUTE FUNCTION immutable_except('journal_entry_id');
CREATE TRIGGER goods_receipt_lines_immutable BEFORE UPDATE OR DELETE ON goods_receipt_lines FOR EACH ROW EXECUTE FUNCTION immutable_except('qty_invoiced_base', 'qty_returned_base', 'value_cleared');
CREATE TRIGGER supplier_invoices_immutable BEFORE UPDATE OR DELETE ON supplier_invoices FOR EACH ROW EXECUTE FUNCTION immutable_except('amount_paid', 'status', 'journal_entry_id');
CREATE TRIGGER supplier_invoice_lines_immutable BEFORE UPDATE OR DELETE ON supplier_invoice_lines FOR EACH ROW EXECUTE FUNCTION immutable_except();
CREATE TRIGGER supplier_payments_immutable BEFORE UPDATE OR DELETE ON supplier_payments FOR EACH ROW EXECUTE FUNCTION immutable_except('journal_entry_id');
CREATE TRIGGER supplier_payment_allocations_immutable BEFORE UPDATE OR DELETE ON supplier_payment_allocations FOR EACH ROW EXECUTE FUNCTION immutable_except();
CREATE TRIGGER supplier_returns_immutable BEFORE UPDATE OR DELETE ON supplier_returns FOR EACH ROW EXECUTE FUNCTION immutable_except('journal_entry_id');
CREATE TRIGGER supplier_return_lines_immutable BEFORE UPDATE OR DELETE ON supplier_return_lines FOR EACH ROW EXECUTE FUNCTION immutable_except();
