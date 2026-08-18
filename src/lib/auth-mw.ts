/**
 * Middleware to enforce a logged-in user via Better Auth (Google OAuth).
 * Populates `c.var.user` with the session user or 401s.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { Auth } from "../auth";

export interface UserVar {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

type AuthResolver = (c: Context) => Auth;

export function requireAuth(getAuth: AuthResolver): MiddlewareHandler {
  return async (c, next) => {
    const auth = getAuth(c);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) {
      return c.json({ error: "unauthorized" }, 401);
    }
    c.set("user", {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null,
    } satisfies UserVar);
    await next();
  };
}

export function tryAuth(getAuth: AuthResolver): MiddlewareHandler {
  return async (c, next) => {
    const auth = getAuth(c);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) {
      c.set("user", {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image ?? null,
      } satisfies UserVar);
    }
    await next();
  };
}
