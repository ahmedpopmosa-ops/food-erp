-- Fix: with no trigger arguments TG_ARGV is NULL, so `to_jsonb(NEW) - NULL` was NULL on both sides and
-- `NULL IS DISTINCT FROM NULL` let every UPDATE through. Affected the fully immutable tables (invoice_taxes,
-- refund_lines, approvals, recipe_lines, stock_adjustment_lines). Found by the Phase 5a inventory tests.
CREATE OR REPLACE FUNCTION immutable_except() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed text[] := coalesce(TG_ARGV::text[], '{}'::text[]);
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
