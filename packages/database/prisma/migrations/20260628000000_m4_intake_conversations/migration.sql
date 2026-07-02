-- Milestone 4 — replace AIConversation (which keyed to a non-existent Case)
-- with Conversation (which stands alone until the user confirms and a Case
-- is created). The conversation is the single source of truth for the
-- intake flow; the Case is a downstream artifact.

-- DropRelation
DROP TABLE IF EXISTS "AIConversation";

-- CreateEnum
CREATE TYPE "IntakeState" AS ENUM (
  'STARTED',
  'GATHERING_PROBLEM',
  'GATHERING_CATEGORY',
  'GATHERING_FACTS',
  'GATHERING_FOLLOWUPS',
  'READY_TO_CONFIRM',
  'CONFIRMED',
  'FAILED'
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "IntakeState" NOT NULL DEFAULT 'STARTED',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "extracted" JSONB NOT NULL DEFAULT '{}',
    "category" "CaseCategory",
    "caseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_userId_idx" ON "Conversation"("userId");
CREATE INDEX "Conversation_state_idx" ON "Conversation"("state");
CREATE INDEX "Conversation_category_idx" ON "Conversation"("category");
CREATE UNIQUE INDEX "Conversation_caseId_key" ON "Conversation"("caseId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;