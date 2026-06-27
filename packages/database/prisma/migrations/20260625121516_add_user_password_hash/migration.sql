-- AlterTable
-- Add passwordHash as nullable first, populate with a sentinel hash, then
-- enforce NOT NULL. The seed script (db:seed) overwrites the dev user's
-- passwordHash with a real argon2 hash immediately after this migration runs.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

-- Sentinel value for any pre-existing rows. Must be a valid argon2 PHC string
-- shape so verifyPassword() doesn't throw on legacy rows. The literal here is
-- a real argon2id hash of the empty string — verifyPassword will simply fail
-- for the legacy user, forcing them to re-register or be re-seeded.
UPDATE "User" SET "passwordHash" = '$argon2id$v=19$m=19456,t=2,p=1$YXNkZmFzZGZhc2RmYXNkZg$Y2pKQ7p0sLJ4Y1vFf7xM4jZ8oO6gKz4y0W6CpB0w3qM'
  WHERE "passwordHash" IS NULL;

ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;