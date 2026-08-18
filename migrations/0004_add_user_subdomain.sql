-- Add user-level subdomain for the profile page (e.g. dean.hosthtml.online).
ALTER TABLE "user" ADD COLUMN "subdomain" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subdomain ON "user"(subdomain);
