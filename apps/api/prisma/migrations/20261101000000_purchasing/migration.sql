-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "tax_number" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "expected_date" DATE,
    "notes" TEXT,
    "total" DECIMAL(19,4) NOT NULL,
    "created_by" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(19,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "qty_base" DECIMAL(19,6) NOT NULL,
    "unit_price" DECIMAL(19,6) NOT NULL,
    "qty_received_base" DECIMAL(19,6) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "order_id" UUID,
    "warehouse_id" UUID NOT NULL,
    "supplier_ref" TEXT,
    "goods_total" DECIMAL(19,4) NOT NULL,
    "charges_total" DECIMAL(19,4) NOT NULL,
    "charges" JSONB NOT NULL DEFAULT '[]',
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journal_entry_id" UUID,
    "created_by" UUID,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "order_line_id" UUID,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(19,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "qty_base" DECIMAL(19,6) NOT NULL,
    "unit_price" DECIMAL(19,6) NOT NULL,
    "goods_value" DECIMAL(19,4) NOT NULL,
    "charges_value" DECIMAL(19,4) NOT NULL,
    "qty_invoiced_base" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "qty_returned_base" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "value_cleared" DECIMAL(19,4) NOT NULL DEFAULT 0,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "supplier_invoice_no" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "tax_total" DECIMAL(19,4) NOT NULL,
    "total" DECIMAL(19,4) NOT NULL,
    "amount_paid" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "journal_entry_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoice_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "receipt_line_id" UUID,
    "account_id" UUID,
    "description" TEXT,
    "qty_base" DECIMAL(19,6),
    "amount" DECIMAL(19,4) NOT NULL,
    "tax_amount" DECIMAL(19,4) NOT NULL,
    "grni_cleared" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "price_variance" DECIMAL(19,4) NOT NULL DEFAULT 0,

    CONSTRAINT "supplier_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "reference" TEXT,
    "paid_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journal_entry_id" UUID,
    "created_by" UUID,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payment_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_returns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "journal_entry_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_return_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "receipt_line_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(19,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "qty_base" DECIMAL(19,6) NOT NULL,
    "grni_value" DECIMAL(19,4) NOT NULL,
    "stock_value" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "supplier_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_code_key" ON "suppliers"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_supplier_id_idx" ON "purchase_orders"("tenant_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_number_key" ON "purchase_orders"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_order_id_item_id_key" ON "purchase_order_lines"("order_id", "item_id");

-- CreateIndex
CREATE INDEX "goods_receipts_tenant_id_supplier_id_idx" ON "goods_receipts"("tenant_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenant_id_number_key" ON "goods_receipts"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_lines_receipt_id_item_id_key" ON "goods_receipt_lines"("receipt_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoices_tenant_id_number_key" ON "supplier_invoices"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoices_tenant_id_supplier_id_supplier_invoice_no_key" ON "supplier_invoices"("tenant_id", "supplier_id", "supplier_invoice_no");

-- CreateIndex
CREATE INDEX "supplier_payments_tenant_id_supplier_id_idx" ON "supplier_payments"("tenant_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_tenant_id_number_key" ON "supplier_payments"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payment_allocations_payment_id_invoice_id_key" ON "supplier_payment_allocations"("payment_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_returns_tenant_id_number_key" ON "supplier_returns"("tenant_id", "number");

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "supplier_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
