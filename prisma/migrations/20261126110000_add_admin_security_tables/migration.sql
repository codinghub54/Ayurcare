-- Admin security tables that exist in schema.prisma but were never captured in a
-- migration (they were most likely created with `prisma db push`).
-- Idempotent: safe to run on a database that already has them.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminSecurityProfile" (
    "userId" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "adminRole" TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
    "permissions" TEXT NOT NULL DEFAULT '*',
    "ipAllowlist" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSecurityProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ActiveSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SecurityAlert" (
    "id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "userId" TEXT,
    "ipAddress" TEXT,
    "details" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "targetSegment" TEXT NOT NULL DEFAULT 'ALL',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SystemAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL DEFAULT 'ALL',
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "isBanner" BOOLEAN NOT NULL DEFAULT false,
    "sentBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ActiveSession_tokenHash_key" ON "ActiveSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "AdminSecurityProfile" ADD CONSTRAINT "AdminSecurityProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ActiveSession" ADD CONSTRAINT "ActiveSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SecurityAlert" ADD CONSTRAINT "SecurityAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
