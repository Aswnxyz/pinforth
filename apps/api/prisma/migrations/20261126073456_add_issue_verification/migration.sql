-- CreateEnum
CREATE TYPE "IssueCloseReason" AS ENUM ('RESOLVED', 'WONT_FIX', 'DUPLICATE', 'NOT_A_BUG', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationResult" AS ENUM ('PASS', 'FAIL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IssueActivityType" ADD VALUE 'FIX_SUBMITTED';
ALTER TYPE "IssueActivityType" ADD VALUE 'FIX_WITHDRAWN';
ALTER TYPE "IssueActivityType" ADD VALUE 'VERIFICATION_PASSED';
ALTER TYPE "IssueActivityType" ADD VALUE 'VERIFICATION_FAILED';
ALTER TYPE "IssueActivityType" ADD VALUE 'ISSUE_CLOSED';
ALTER TYPE "IssueActivityType" ADD VALUE 'ISSUE_REOPENED';

-- AlterEnum
ALTER TYPE "IssueStatus" ADD VALUE 'VERIFIED';

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "closeNote" TEXT,
ADD COLUMN     "closeReason" "IssueCloseReason",
ADD COLUMN     "closedAt" TIMESTAMPTZ(3),
ADD COLUMN     "closedById" UUID;

-- CreateTable
CREATE TABLE "FixSubmission" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "deploymentId" UUID NOT NULL,
    "submittedById" UUID,
    "note" TEXT,
    "clientMutationId" VARCHAR(128) NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "withdrawnAt" TIMESTAMPTZ(3),
    "withdrawnById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "fixSubmissionId" UUID NOT NULL,
    "deploymentId" UUID NOT NULL,
    "verifiedById" UUID,
    "result" "VerificationResult" NOT NULL,
    "note" TEXT,
    "selfVerified" BOOLEAN NOT NULL DEFAULT false,
    "clientMutationId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FixSubmission_issueId_createdAt_idx" ON "FixSubmission"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "FixSubmission_deploymentId_idx" ON "FixSubmission"("deploymentId");

-- CreateIndex
CREATE INDEX "FixSubmission_submittedById_idx" ON "FixSubmission"("submittedById");

-- CreateIndex
CREATE UNIQUE INDEX "FixSubmission_issueId_attemptNumber_key" ON "FixSubmission"("issueId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FixSubmission_issueId_submittedById_clientMutationId_key" ON "FixSubmission"("issueId", "submittedById", "clientMutationId");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_fixSubmissionId_key" ON "Verification"("fixSubmissionId");

-- CreateIndex
CREATE INDEX "Verification_issueId_createdAt_idx" ON "Verification"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "Verification_deploymentId_idx" ON "Verification"("deploymentId");

-- CreateIndex
CREATE INDEX "Verification_verifiedById_idx" ON "Verification"("verifiedById");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_issueId_verifiedById_clientMutationId_key" ON "Verification"("issueId", "verifiedById", "clientMutationId");

-- CreateIndex
CREATE INDEX "Issue_closedById_idx" ON "Issue"("closedById");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixSubmission" ADD CONSTRAINT "FixSubmission_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixSubmission" ADD CONSTRAINT "FixSubmission_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixSubmission" ADD CONSTRAINT "FixSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixSubmission" ADD CONSTRAINT "FixSubmission_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_fixSubmissionId_fkey" FOREIGN KEY ("fixSubmissionId") REFERENCES "FixSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
