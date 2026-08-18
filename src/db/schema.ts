import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// Better Auth tables (user, session, account, verification) are created by the
// migration and used via better-auth's own adapter, so they are not declared
// here. Only the app-specific table is typed.

export const page = sqliteTable(
  "page",
  {
    id: text("id").primaryKey(),              // ULID
    userId: text("userId").notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),             // human/URL-friendly name
    subdomain: text("subdomain"),             // sub-domain prefix: <subdomain>.hosthtml.online
    path: text("path").notNull(),             // R2 key: "users/<userId>/<pageId>.html"
    size: integer("size").notNull().default(0),
    isPublic: integer("isPublic", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("createdAt").notNull(),
    updatedAt: integer("updatedAt").notNull(),
  },
  (t) => [index("idx_page_user").on(t.userId), index("idx_page_public").on(t.isPublic), index("idx_page_subdomain").on(t.subdomain)],
);
