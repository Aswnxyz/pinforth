-- The historical backfill is already applied in some databases. Guard its
-- original UPDATE statements on databases where it still has to run.
-- Keep issue writers offline until the cleanup migration removes the guard.
BEGIN;

DO $migration$
BEGIN
    IF to_regclass('_prisma_migrations') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM "_prisma_migrations"
            WHERE "migration_name" = '20261126073530_migrate_legacy_issue_verification_state'
              AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
        ) THEN
            RETURN;
        END IF;
    END IF;

    CREATE FUNCTION "_guard_issue_verification_backfill"() RETURNS trigger
    LANGUAGE plpgsql AS $guard$
    BEGIN
        IF OLD."status" = 'CLOSED' THEN
            -- Skip the entire update, including its synthetic close note.
            RETURN NULL;
        END IF;

        IF EXISTS (SELECT 1 FROM "FixSubmission" WHERE "issueId" = OLD."id") THEN
            RETURN NULL;
        END IF;

        RETURN NEW;
    END;
    $guard$;

    CREATE TRIGGER "_guard_issue_verification_backfill"
    BEFORE UPDATE OF "status", "closeReason" ON "Issue"
    FOR EACH ROW WHEN (
        (OLD."status" = 'CLOSED' AND OLD."closeReason" IS NOT NULL AND NEW."closeReason" = 'OTHER')
        OR (OLD."status" = 'READY_FOR_VERIFICATION' AND NEW."status" = 'IN_PROGRESS')
    )
    EXECUTE FUNCTION "_guard_issue_verification_backfill"();
END;
$migration$;

COMMIT;
