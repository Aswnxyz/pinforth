-- Legacy issues could be moved to READY_FOR_VERIFICATION by the previous PATCH
-- endpoint without any recorded fix submission. That state is not verifiable
-- under the new workflow: no fix exists, so no deployment can be retested.
-- Move those issues back to IN_PROGRESS instead of fabricating a fix.
UPDATE "Issue"
SET "status" = 'IN_PROGRESS'
WHERE "status" = 'READY_FOR_VERIFICATION';

-- Preserve every historical closure. The original close reason was never
-- stored, and the original closing actor/time cannot be recovered, so record
-- an explicit unknown reason while leaving "closedAt" and "closedById" NULL.
UPDATE "Issue"
SET "closeReason" = 'OTHER',
    "closeNote" = COALESCE(
      "closeNote",
      'Closed before close reasons were recorded. The original reason is unknown.'
    )
WHERE "status" = 'CLOSED';
