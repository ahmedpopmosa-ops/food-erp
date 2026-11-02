-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "cash_session_id" UUID,
ADD COLUMN     "employee_id" UUID;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "cash_session_id" UUID,
ADD COLUMN     "refund_id" UUID;

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "employee_no" TEXT NOT NULL,
    "full_name_ar" TEXT NOT NULL,
    "full_name_en" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "pos_pin_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_branches" (
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,

    CONSTRAINT "employee_branches_pkey" PRIMARY KEY ("employee_id","branch_id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "approver_employee_id" UUID NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'pin',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "device_id" UUID,
    "operation_id" UUID,
    "authorised" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMPTZ(6) NOT NULL,
    "opening_float" DECIMAL(19,4) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "expected_cash" DECIMAL(19,4),
    "device_expected_cash" DECIMAL(19,4),
    "counted_cash" DECIMAL(19,4),
    "variance" DECIMAL(19,4),
    "counted_breakdown" JSONB,
    "journal_entry_id" UUID,
    "opened_operation_id" UUID NOT NULL,
    "closed_operation_id" UUID,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cash_session_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "approval_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "journal_entry_id" UUID,
    "operation_id" UUID NOT NULL,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "cash_session_id" UUID,
    "reason" TEXT NOT NULL,
    "net_total" DECIMAL(19,4) NOT NULL,
    "tax_total" DECIMAL(19,4) NOT NULL,
    "total" DECIMAL(19,4) NOT NULL,
    "approval_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "journal_entry_id" UUID,
    "operation_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "refund_id" UUID NOT NULL,
    "invoice_line_id" UUID NOT NULL,
    "qty" DECIMAL(19,6) NOT NULL,
    "net_amount" DECIMAL(19,4) NOT NULL,
    "tax_amount" DECIMAL(19,4) NOT NULL,
    "gross_amount" DECIMAL(19,4) NOT NULL,
    "taxes" JSONB NOT NULL,
    "return_to_stock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "refund_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenant_id_employee_no_key" ON "employees"("tenant_id", "employee_no");

-- CreateIndex
CREATE INDEX "employee_branches_tenant_id_branch_id_idx" ON "employee_branches"("tenant_id", "branch_id");

-- CreateIndex
CREATE INDEX "approvals_tenant_id_subject_type_subject_id_idx" ON "approvals"("tenant_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "cash_sessions_tenant_id_branch_id_opened_at_idx" ON "cash_sessions"("tenant_id", "branch_id", "opened_at");

-- CreateIndex
CREATE INDEX "refunds_tenant_id_invoice_id_idx" ON "refunds"("tenant_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_tenant_id_number_key" ON "refunds"("tenant_id", "number");

-- AddForeignKey
ALTER TABLE "employee_branches" ADD CONSTRAINT "employee_branches_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_lines" ADD CONSTRAINT "refund_lines_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
