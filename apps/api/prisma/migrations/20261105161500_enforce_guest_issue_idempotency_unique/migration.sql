-- DropIndex
DROP INDEX "Issue_guestLinkId_clientMutationId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Issue_guestLinkId_clientMutationId_key" ON "Issue"("guestLinkId", "clientMutationId");
