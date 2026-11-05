-- CreateEnum
CREATE TYPE "ReviewRoundStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "clientMutationId" VARCHAR(128),
ADD COLUMN     "guestEmail" VARCHAR(320),
ADD COLUMN     "guestLinkId" UUID,
ADD COLUMN     "guestName" VARCHAR(160),
ADD COLUMN     "reviewRoundId" UUID,
ALTER COLUMN "reporterId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ReviewRound" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "environmentId" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "status" "ReviewRoundStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReviewRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestAccessLink" (
    "id" UUID NOT NULL,
    "reviewRoundId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "reviewerName" VARCHAR(160),
    "reviewerEmail" VARCHAR(320),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GuestAccessLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestHandoffCode" (
    "id" UUID NOT NULL,
    "guestLinkId" UUID NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestHandoffCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSession" (
    "id" UUID NOT NULL,
    "guestLinkId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewRound_projectId_status_idx" ON "ReviewRound"("projectId", "status");

-- CreateIndex
CREATE INDEX "ReviewRound_environmentId_idx" ON "ReviewRound"("environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestAccessLink_tokenHash_key" ON "GuestAccessLink"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestAccessLink_reviewRoundId_idx" ON "GuestAccessLink"("reviewRoundId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestHandoffCode_codeHash_key" ON "GuestHandoffCode"("codeHash");

-- CreateIndex
CREATE INDEX "GuestHandoffCode_guestLinkId_idx" ON "GuestHandoffCode"("guestLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestSession_tokenHash_key" ON "GuestSession"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestSession_guestLinkId_idx" ON "GuestSession"("guestLinkId");

-- CreateIndex
CREATE INDEX "Issue_reviewRoundId_idx" ON "Issue"("reviewRoundId");

-- CreateIndex
CREATE INDEX "Issue_guestLinkId_idx" ON "Issue"("guestLinkId");

-- CreateIndex
CREATE INDEX "Issue_guestLinkId_clientMutationId_idx" ON "Issue"("guestLinkId", "clientMutationId");

-- AddForeignKey
ALTER TABLE "ReviewRound" ADD CONSTRAINT "ReviewRound_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRound" ADD CONSTRAINT "ReviewRound_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRound" ADD CONSTRAINT "ReviewRound_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAccessLink" ADD CONSTRAINT "GuestAccessLink_reviewRoundId_fkey" FOREIGN KEY ("reviewRoundId") REFERENCES "ReviewRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAccessLink" ADD CONSTRAINT "GuestAccessLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestHandoffCode" ADD CONSTRAINT "GuestHandoffCode_guestLinkId_fkey" FOREIGN KEY ("guestLinkId") REFERENCES "GuestAccessLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_guestLinkId_fkey" FOREIGN KEY ("guestLinkId") REFERENCES "GuestAccessLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_reviewRoundId_fkey" FOREIGN KEY ("reviewRoundId") REFERENCES "ReviewRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_guestLinkId_fkey" FOREIGN KEY ("guestLinkId") REFERENCES "GuestAccessLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
