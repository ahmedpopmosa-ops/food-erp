-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "recipe_version_id" UUID;

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ingredient',
    "base_unit" TEXT NOT NULL,
    "standard_cost" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "conversions" JSONB NOT NULL DEFAULT '{}',
    "min_qty" DECIMAL(19,6),
    "archived_at" TIMESTAMPTZ(6),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "yield_qty" DECIMAL(19,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "recipe_version_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(19,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "qty_base" DECIMAL(19,6) NOT NULL,
    "waste_pct" DECIMAL(9,6) NOT NULL DEFAULT 0,

    CONSTRAINT "recipe_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "movement_type" TEXT NOT NULL,
    "qty_base" DECIMAL(19,6) NOT NULL,
    "unit_cost" DECIMAL(19,6) NOT NULL,
    "total_cost" DECIMAL(19,4) NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "source_line_id" UUID,
    "business_date" DATE NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journal_entry_id" UUID,
    "reason_code" TEXT,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty_base" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "total_value" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "avg_unit_cost" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("warehouse_id","item_id")
);

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journal_entry_id" UUID,
    "created_by" UUID,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustment_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "adjustment_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(19,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "qty_base" DECIMAL(19,6) NOT NULL,
    "unit_cost" DECIMAL(19,6),

    CONSTRAINT "stock_adjustment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "snapshot_at" TIMESTAMPTZ(6) NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "journal_entry_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "count_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "system_qty" DECIMAL(19,6) NOT NULL,
    "counted_qty" DECIMAL(19,6),
    "difference_qty" DECIMAL(19,6),

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "from_warehouse_id" UUID NOT NULL,
    "to_warehouse_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "dispatched_at" TIMESTAMPTZ(6),
    "dispatched_by" UUID,
    "received_at" TIMESTAMPTZ(6),
    "received_by" UUID,
    "dispatch_journal_id" UUID,
    "receive_journal_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty_sent" DECIMAL(19,6) NOT NULL,
    "qty_received" DECIMAL(19,6),
    "unit_cost" DECIMAL(19,6),

    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_tenant_id_code_key" ON "inventory_items"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_tenant_id_variant_id_key" ON "recipes"("tenant_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_versions_recipe_id_version_key" ON "recipe_versions"("recipe_id", "version");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_item_id_warehouse_id_posted_at_idx" ON "stock_movements"("tenant_id", "item_id", "warehouse_id", "posted_at");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_source_type_source_id_idx" ON "stock_movements"("tenant_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "stock_balances_tenant_id_idx" ON "stock_balances"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustments_tenant_id_number_key" ON "stock_adjustments"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_tenant_id_number_key" ON "stock_counts"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_lines_count_id_item_id_key" ON "stock_count_lines"("count_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_tenant_id_number_key" ON "stock_transfers"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_lines_transfer_id_item_id_key" ON "stock_transfer_lines"("transfer_id", "item_id");

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_recipe_version_id_fkey" FOREIGN KEY ("recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
