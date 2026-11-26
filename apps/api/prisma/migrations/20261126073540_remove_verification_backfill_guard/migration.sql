-- Remove the temporary protection once the immutable legacy backfill is done.
BEGIN;
DROP TRIGGER IF EXISTS "_guard_issue_verification_backfill" ON "Issue";
DROP FUNCTION IF EXISTS "_guard_issue_verification_backfill"();
COMMIT;
