import { env } from "cloudflare:workers";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../db";
import { users, type UserRow } from "../../db/schema";
import { type ChatGPTUser } from "../chatgpt-auth";
import { OrderError, emailIsAdmin } from "./order-validation";

export function serializeAccount(row: UserRow) {
  return {id:row.id,name:row.name,email:row.email,role:row.role as "customer"|"admin",joined:!!row.userId,createdAt:row.createdAt};
}

export async function getOrCreateAccount(user: ChatGPTUser): Promise<UserRow> {
  const db = getDb();
  const [identified] = await db.select().from(users).where(eq(users.userId,user.userId)).limit(1);
  if (identified) return identified;
  const email = user.email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email,email)).limit(1);
  const now = new Date().toISOString();
  if (existing) {
    if (existing.userId && existing.userId !== user.userId) throw new OrderError("This email is already linked to a different account.",409);
    const [bound] = await db.update(users).set({userId:user.userId,updatedAt:now}).where(and(eq(users.id,existing.id),isNull(users.userId))).returning();
    if (bound) return bound;
    const [sameIdentity] = await db.select().from(users).where(eq(users.userId,user.userId)).limit(1);
    if (sameIdentity) return sameIdentity;
    throw new OrderError("This account changed while signing in. Please try again.",409);
  }
  const settings = env as typeof env & {ADMIN_EMAILS?:string};
  await db.insert(users).values({id:crypto.randomUUID(),userId:user.userId,email,name:user.displayName.slice(0,120),role:emailIsAdmin(email,settings.ADMIN_EMAILS)?"admin":"customer",createdAt:now,updatedAt:now}).onConflictDoNothing();
  const [created] = await db.select().from(users).where(eq(users.userId,user.userId)).limit(1);
  if (created) return created;
  // A pre-provisioning request may have won the email uniqueness race.
  const [pending] = await db.select().from(users).where(eq(users.email,email)).limit(1);
  if (pending && !pending.userId) {
    const [bound] = await db.update(users).set({userId:user.userId,updatedAt:now}).where(and(eq(users.id,pending.id),isNull(users.userId))).returning();
    if (bound) return bound;
  }
  throw new OrderError("We could not link your account. Please try signing in again.",409);
}
