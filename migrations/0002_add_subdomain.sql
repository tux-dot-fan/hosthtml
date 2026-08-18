-- Add subdomain column for per-page custom subdomains (<slug>.hosthtml.online).
ALTER TABLE "page" ADD COLUMN "subdomain" TEXT;
CREATE INDEX IF NOT EXISTS idx_page_subdomain ON page(subdomain);
