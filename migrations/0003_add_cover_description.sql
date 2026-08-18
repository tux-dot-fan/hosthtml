-- Add cover image path and description for pages.
ALTER TABLE "page" ADD COLUMN "cover" TEXT;
ALTER TABLE "page" ADD COLUMN "description" TEXT;
