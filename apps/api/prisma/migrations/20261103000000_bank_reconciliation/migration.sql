-- Phase 6b: bank reconciliation (P6-7).

CREATE TABLE "bank_statements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "opening_balance" DECIMAL(19,4) NOT NULL,
    "closing_balance" DECIMAL(19,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciled_at" TIMESTAMPTZ(6),
    "reconciled_by" UUID,
    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_statement_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "statement_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "txn_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,
    "journal_line_id" UUID,
    "matched_at" TIMESTAMPTZ(6),
    "matched_by" UUID,
    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_statements_tenant_id_account_id_reference_key" ON "bank_statements"("tenant_id", "account_id", "reference");
CREATE UNIQUE INDEX "bank_statement_lines_statement_id_line_no_key" ON "bank_statement_lines"("statement_id", "line_no");
-- A journal line is matched to at most one bank line, across all statements.
CREATE UNIQUE INDEX "bank_statement_lines_journal_line_id_key" ON "bank_statement_lines"("journal_line_id");
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "bank_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_statements', 'bank_statement_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      t
    );
  END LOOP;
END
$$;
REVOKE DELETE ON TABLE bank_statements, bank_statement_lines FROM ros_app;

CREATE UNIQUE INDEX bank_statements_id_tenant_key ON bank_statements (id, tenant_id);
CREATE UNIQUE INDEX journal_lines_id_tenant_key ON journal_lines (id, tenant_id);
ALTER TABLE bank_statements ADD FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE bank_statements ADD FOREIGN KEY (account_id, tenant_id) REFERENCES accounts (id, tenant_id);
ALTER TABLE bank_statement_lines ADD FOREIGN KEY (statement_id, tenant_id) REFERENCES bank_statements (id, tenant_id);
ALTER TABLE bank_statement_lines ADD FOREIGN KEY (journal_line_id, tenant_id) REFERENCES journal_lines (id, tenant_id);

ALTER TABLE bank_statements ADD CHECK (status IN ('open', 'reconciled') AND end_date >= start_date);
ALTER TABLE bank_statements ADD CHECK (status = 'open' OR reconciled_at IS NOT NULL);
ALTER TABLE bank_statement_lines ADD CHECK (amount <> 0 AND line_no > 0);
ALTER TABLE bank_statement_lines ADD CHECK ((journal_line_id IS NULL) = (matched_at IS NULL));

-- A match always pairs the same account and the same signed amount, on a posted entry.
CREATE OR REPLACE FUNCTION bank_line_match_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_account uuid; v_amount numeric; v_status text; v_stmt_account uuid; v_stmt_status text;
BEGIN
  SELECT account_id, status INTO v_stmt_account, v_stmt_status FROM bank_statements WHERE id = NEW.statement_id;
  IF TG_OP = 'UPDATE' THEN
    IF v_stmt_status = 'reconciled' THEN
      RAISE EXCEPTION 'lines of a reconciled bank statement are immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['journal_line_id', 'matched_at', 'matched_by'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['journal_line_id', 'matched_at', 'matched_by']) THEN
      RAISE EXCEPTION 'bank statement lines are immutable (only the match may change)' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.journal_line_id IS NOT NULL THEN
    SELECT l.account_id, l.debit - l.credit, e.status INTO v_account, v_amount, v_status
    FROM journal_lines l JOIN journal_entries e ON e.id = l.journal_entry_id WHERE l.id = NEW.journal_line_id;
    IF v_account IS DISTINCT FROM v_stmt_account OR v_amount IS DISTINCT FROM NEW.amount OR v_status IS DISTINCT FROM 'posted' THEN
      RAISE EXCEPTION 'bank line % can only match a posted journal line of the same account and amount', NEW.line_no
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bank_line_match_guard BEFORE INSERT OR UPDATE ON bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION bank_line_match_guard();

-- Only the status (open → reconciled) and its stamp change; a reconciled statement never changes.
CREATE OR REPLACE FUNCTION bank_statement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'reconciled' THEN
    RAISE EXCEPTION 'bank statement % is reconciled', OLD.reference USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'reconciled_at', 'reconciled_by'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'reconciled_at', 'reconciled_by']) THEN
    RAISE EXCEPTION 'bank statements are immutable (only completion may change)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bank_statement_guard BEFORE UPDATE ON bank_statements
  FOR EACH ROW EXECUTE FUNCTION bank_statement_guard();
