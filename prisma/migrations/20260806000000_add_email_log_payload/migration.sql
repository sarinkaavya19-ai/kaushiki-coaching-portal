-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN     "html" TEXT,
ADD COLUMN     "text" TEXT,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "email_logs_template_idx" ON "email_logs"("template");
