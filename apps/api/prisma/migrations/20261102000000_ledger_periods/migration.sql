-- Phase 6a: fiscal-year close, and the database half of invariant I11 (closed periods are protected).

ALTER TABLE "fiscal_years" ADD COLUMN "closing_entry_id" UUID;
ALTER TABLE "fiscal_years" ADD COLUMN "closed_at" TIMESTAMPTZ(6);
ALTER TABLE "fiscal_years" ADD COLUMN "closed_by" UUID;
ALTER TABLE fiscal_years ADD FOREIGN KEY (closing_entry_id, tenant_id) REFERENCES journal_entries (id, tenant_id);
ALTER TABLE fiscal_years ADD CHECK (status = 'open' OR closed_at IS NOT NULL);

-- No entry is posted into a closed period, whatever the code path; the only exception is a fiscal year's own
-- closing entry, which is dated the year's last day after every period of it was closed.
CREATE OR REPLACE FUNCTION journal_period_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'posted' AND NEW.source_type <> 'year_close'
     AND (SELECT status FROM accounting_periods WHERE id = NEW.period_id) = 'closed' THEN
    RAISE EXCEPTION 'accounting period of journal entry % is closed', NEW.number USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_period_guard BEFORE INSERT OR UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION journal_period_guard();

-- Once a fiscal year is closed its periods never change (no reopening past the closing entry).
CREATE OR REPLACE FUNCTION accounting_period_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT status FROM fiscal_years WHERE id = OLD.fiscal_year_id) = 'closed' THEN
    RAISE EXCEPTION 'periods of a closed fiscal year are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounting_period_guard BEFORE UPDATE OR DELETE ON accounting_periods
  FOR EACH ROW EXECUTE FUNCTION accounting_period_guard();

-- A closed fiscal year stays closed.
CREATE OR REPLACE FUNCTION fiscal_year_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'fiscal year % is closed', OLD.name USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fiscal_year_guard BEFORE UPDATE OR DELETE ON fiscal_years
  FOR EACH ROW EXECUTE FUNCTION fiscal_year_guard();
