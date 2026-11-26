-- Consultation room: chat, WebRTC signalling and presence.
-- Additive only: no existing table or column is changed.

-- CreateTable
CREATE TABLE IF NOT EXISTS "ConsultationMessage" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CallSignal" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ConsultationPresence" (
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inCall" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationPresence_pkey" PRIMARY KEY ("appointmentId","userId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConsultationMessage_appointmentId_createdAt_idx" ON "ConsultationMessage"("appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CallSignal_appointmentId_toUserId_createdAt_idx" ON "CallSignal"("appointmentId", "toUserId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConsultationMessage" ADD CONSTRAINT "ConsultationMessage_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CallSignal" ADD CONSTRAINT "CallSignal_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConsultationPresence" ADD CONSTRAINT "ConsultationPresence_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
