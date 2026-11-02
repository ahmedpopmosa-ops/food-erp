-- CreateTable
CREATE TABLE "tax_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "rate" DECIMAL(9,6) NOT NULL,
    "kind" TEXT NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "output_account_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tax_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_category_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "tax_category_id" UUID NOT NULL,
    "tax_rate_id" UUID NOT NULL,
    "applies_to" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tax_category_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "opens_drawer" BOOLEAN NOT NULL DEFAULT false,
    "allows_change" BOOLEAN NOT NULL DEFAULT false,
    "requires_reference" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "sku" TEXT,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'menu_item',
    "tax_category_id" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name_ar" TEXT,
    "name_en" TEXT,
    "sku" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "branch_id" UUID,
    "channel" TEXT,
    "price" DECIMAL(19,4) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'pos',
    "status" TEXT NOT NULL DEFAULT 'pending_pairing',
    "pairing_code_hash" TEXT,
    "pairing_expires_at" TIMESTAMPTZ(6),
    "app_version" TEXT,
    "os_version" TEXT,
    "last_seen_at" TIMESTAMPTZ(6),
    "local_schema_version" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "parent_id" UUID,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "normal_balance" TEXT NOT NULL,
    "is_postable" BOOLEAN NOT NULL DEFAULT true,
    "is_control" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "period_no" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "original_date" DATE,
    "period_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID,
    "purpose" TEXT NOT NULL DEFAULT 'main',
    "status" TEXT NOT NULL,
    "reversal_of_id" UUID,
    "memo" TEXT,
    "posted_at" TIMESTAMPTZ(6),
    "posted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "account_id" UUID NOT NULL,
    "debit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currency_code" CHAR(3) NOT NULL,
    "branch_id" UUID,
    "description" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "mapping_key" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL DEFAULT 'tenant',
    "scope_id" UUID,
    "account_id" UUID NOT NULL,

    CONSTRAINT "accounting_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "tenant_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "next_value" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("tenant_id","doc_type","scope_key")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "local_number" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "business_date" DATE NOT NULL,
    "catalog_version" INTEGER,
    "operation_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "variant_id" UUID NOT NULL,
    "product_name_ar" TEXT NOT NULL,
    "product_name_en" TEXT NOT NULL,
    "qty" DECIMAL(19,6) NOT NULL,
    "unit_price" DECIMAL(19,4) NOT NULL,
    "tax_category_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "prices_include_tax" BOOLEAN NOT NULL,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "discount_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "service_charge_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(19,4) NOT NULL,
    "rounding_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL,
    "paid_total" DECIMAL(19,4) NOT NULL,
    "refunded_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "payment_status" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "business_date" DATE NOT NULL,
    "catalog_version" INTEGER,
    "journal_entry_id" UUID,
    "operation_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "order_item_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "description_ar" TEXT NOT NULL,
    "description_en" TEXT NOT NULL,
    "qty" DECIMAL(19,6) NOT NULL,
    "unit_price" DECIMAL(19,4) NOT NULL,
    "net_amount" DECIMAL(19,4) NOT NULL,
    "tax_amount" DECIMAL(19,4) NOT NULL,
    "gross_amount" DECIMAL(19,4) NOT NULL,
    "tax_category_id" UUID NOT NULL,
    "taxes" JSONB NOT NULL,
    "refunded_qty" DECIMAL(19,6) NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_taxes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "tax_rate_id" UUID NOT NULL,
    "rate" DECIMAL(9,6) NOT NULL,
    "taxable_base" DECIMAL(19,4) NOT NULL,
    "tax_amount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "invoice_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'in',
    "payment_method_id" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "tendered" DECIMAL(19,4),
    "change_given" DECIMAL(19,4),
    "reference" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "journal_entry_id" UUID,
    "operation_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_discrepancies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,

    CONSTRAINT "sale_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "op_count" INTEGER NOT NULL,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "retryable" INTEGER NOT NULL DEFAULT 0,
    "client_app_version" TEXT NOT NULL,
    "client_schema_version" INTEGER NOT NULL,
    "duration_ms" INTEGER,

    CONSTRAINT "sync_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "operation_type" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "local_seq" BIGINT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL,
    "error_code" TEXT,
    "error_detail" JSONB,
    "server_refs" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "first_received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "sync_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "tenant_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resource_refs" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("tenant_id","scope","key")
);

-- CreateTable
CREATE TABLE "change_log" (
    "change_seq" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "branch_id" UUID,
    "op" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_log_pkey" PRIMARY KEY ("change_seq")
);

-- CreateTable
CREATE TABLE "device_sync_state" (
    "device_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pull_cursor" BIGINT NOT NULL DEFAULT 0,
    "last_push_at" TIMESTAMPTZ(6),
    "last_pull_at" TIMESTAMPTZ(6),
    "last_error_code" TEXT,
    "clock_skew_ms" INTEGER,

    CONSTRAINT "device_sync_state_pkey" PRIMARY KEY ("device_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_tenant_id_code_key" ON "tax_rates"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "tax_categories_tenant_id_code_key" ON "tax_categories"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "tax_category_rates_tax_category_id_tax_rate_id_applies_to_key" ON "tax_category_rates"("tax_category_id", "tax_rate_id", "applies_to");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_tenant_id_code_key" ON "payment_methods"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "categories_tenant_id_idx" ON "categories"("tenant_id");

-- CreateIndex
CREATE INDEX "products_tenant_id_idx" ON "products"("tenant_id");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_prices_variant_id_idx" ON "product_prices"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_pairing_code_hash_key" ON "devices"("pairing_code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "devices_tenant_id_branch_id_code_key" ON "devices"("tenant_id", "branch_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_hash_key" ON "device_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "device_tokens_device_id_idx" ON "device_tokens"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenant_id_code_key" ON "accounts"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_tenant_id_name_key" ON "fiscal_years"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "accounting_periods_tenant_id_start_date_idx" ON "accounting_periods"("tenant_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_fiscal_year_id_period_no_key" ON "accounting_periods"("fiscal_year_id", "period_no");

-- CreateIndex
CREATE INDEX "journal_entries_tenant_id_entry_date_idx" ON "journal_entries"("tenant_id", "entry_date");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenant_id_number_key" ON "journal_entries"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "journal_lines_tenant_id_account_id_idx" ON "journal_lines"("tenant_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_lines_journal_entry_id_line_no_key" ON "journal_lines"("journal_entry_id", "line_no");

-- CreateIndex
CREATE INDEX "accounting_mappings_tenant_id_mapping_key_idx" ON "accounting_mappings"("tenant_id", "mapping_key");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenant_id_local_number_key" ON "orders"("tenant_id", "local_number");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_line_no_key" ON "order_items"("order_id", "line_no");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_business_date_idx" ON "invoices"("tenant_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_number_key" ON "invoices"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_invoice_id_line_no_key" ON "invoice_lines"("invoice_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_taxes_invoice_id_tax_rate_id_key" ON "invoice_taxes"("invoice_id", "tax_rate_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_invoice_id_idx" ON "payments"("tenant_id", "invoice_id");

-- CreateIndex
CREATE INDEX "sale_discrepancies_tenant_id_status_idx" ON "sale_discrepancies"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sync_batches_tenant_id_device_id_received_at_idx" ON "sync_batches"("tenant_id", "device_id", "received_at");

-- CreateIndex
CREATE INDEX "sync_operations_tenant_id_status_idx" ON "sync_operations"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sync_operations_tenant_id_operation_id_key" ON "sync_operations"("tenant_id", "operation_id");

-- CreateIndex
CREATE INDEX "change_log_tenant_id_change_seq_idx" ON "change_log"("tenant_id", "change_seq");

-- AddForeignKey
ALTER TABLE "tax_category_rates" ADD CONSTRAINT "tax_category_rates_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "tax_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_category_rates" ADD CONSTRAINT "tax_category_rates_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_taxes" ADD CONSTRAINT "invoice_taxes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
