import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "./db";
import * as schema from "./db/schema";
import type { Env } from "./env";

/**
 * Build a Better Auth instance bound to this Worker's D1 database.
 * Google is the social provider for sign-in.
 */
export function createAuth(env: Env) {
  const db = getDb(env);
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      usePlural: false, // migration uses singular table names: user, session, account, verification
      schema, // better-auth needs the schema so it can map user/session/account/verification models
    }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 min
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
