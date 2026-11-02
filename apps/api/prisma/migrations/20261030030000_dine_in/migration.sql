-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "max_discount_pct" DECIMAL(9,6) NOT NULL DEFAULT 0.2,
ADD COLUMN     "service_charge_rate" DECIMAL(9,6) NOT NULL DEFAULT 0,
ADD COLUMN     "service_charge_tax_category_id" UUID;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "discount" JSONB,
ADD COLUMN     "employee_id" UUID,
ADD COLUMN     "guests" INTEGER,
ADD COLUMN     "table_id" UUID;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "modifiers" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "void_approval_id" UUID,
ADD COLUMN     "void_reason" TEXT;

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "discount" JSONB,
ADD COLUMN     "discount_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "modifiers" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "modifier_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "price_delta" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_modifier_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_areas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dining_tables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "service_area_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_modifier_groups_product_id_group_id_key" ON "product_modifier_groups"("product_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_areas_branch_id_name_en_key" ON "service_areas"("branch_id", "name_en");

-- CreateIndex
CREATE UNIQUE INDEX "dining_tables_branch_id_label_key" ON "dining_tables"("branch_id", "label");

-- AddForeignKey
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "modifier_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_service_area_id_fkey" FOREIGN KEY ("service_area_id") REFERENCES "service_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
