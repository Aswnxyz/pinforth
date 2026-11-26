-- CreateTable
CREATE TABLE "Deployment" (
    "id" UUID NOT NULL,
    "environmentId" UUID NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "commitSha" VARCHAR(40),
    "url" VARCHAR(2048),
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deployment_environmentId_createdAt_id_idx" ON "Deployment"("environmentId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_environmentId_label_key" ON "Deployment"("environmentId", "label");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
