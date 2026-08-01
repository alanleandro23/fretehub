ALTER TABLE "Company"
ADD COLUMN "logoUrl" TEXT;

CREATE TABLE "QuoteProposalLog" (
    "id" SERIAL NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "userId" INTEGER,
    "recipients" JSONB NOT NULL,
    "cc" JSONB,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "formats" JSONB NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteProposalLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteProposalLog_quoteId_createdAt_idx"
ON "QuoteProposalLog"("quoteId", "createdAt");

CREATE INDEX "QuoteProposalLog_userId_idx"
ON "QuoteProposalLog"("userId");

ALTER TABLE "QuoteProposalLog"
ADD CONSTRAINT "QuoteProposalLog_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteProposalLog"
ADD CONSTRAINT "QuoteProposalLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
