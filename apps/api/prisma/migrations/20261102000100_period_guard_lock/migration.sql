-- Review fix (Phase 6a): the closed-period guard read the period status without a lock, so a period closed
-- by a concurrent transaction after that read could still receive the entry. The guard now share-locks the
-- period row until the entry's transaction ends: a close (UPDATE of that row) waits for the entry, and an entry
-- arriving after a committed close sees `closed` and is refused.
CREATE OR REPLACE FUNCTION journal_period_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  IF NEW.status = 'posted' AND NEW.source_type <> 'year_close' THEN
    SELECT status INTO v_status FROM accounting_periods WHERE id = NEW.period_id FOR SHARE;
    IF v_status = 'closed' THEN
      RAISE EXCEPTION 'accounting period of journal entry % is closed', NEW.number USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
