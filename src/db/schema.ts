import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// Better Auth tables. These must match the migration (0001_init.sql) so the
// drizzle adapter can map user/session/account/verification models.

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  subdomain: text("subdomain"), // user-level subdomain: <subdomain>.hosthtml.online
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }),
});

export const page = sqliteTable(
  "page",
  {
    id: text("id").primaryKey(),              // ULID
    userId: text("userId").notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),             // human/URL-friendly name
    subdomain: text("subdomain"),             // sub-domain prefix: <subdomain>.hosthtml.online
    path: text("path").notNull(),             // R2 key: "users/<userId>/<pageId>.html"
    cover: text("cover"),                     // R2 key for cover image: "covers/<pageId>.<ext>"
    description: text("description"),         // short page description / excerpt
    size: integer("size").notNull().default(0),
    isPublic: integer("isPublic", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("createdAt").notNull(),
    updatedAt: integer("updatedAt").notNull(),
  },
  (t) => [index("idx_page_user").on(t.userId), index("idx_page_public").on(t.isPublic), index("idx_page_subdomain").on(t.subdomain)],
);
