import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { users } from "../../../../../db/schema";
import { handleApi, json, readJson, requireUser } from "../../../../lib/api";
import { OrderError, requireSameOrigin } from "../../../../lib/order-validation";
import { assertMayChangeRole, KEEP_JOINED_ADMIN_SQL, validateAccount } from "../../../../lib/admin-validation";
import { serializeAccount } from "../../../../lib/accounts";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: {params:Promise<{id:string}>}) {
  return handleApi(async () => {
    const caller = await requireUser(true); requireSameOrigin(request);
    const {id} = await context.params; const db = getDb();
    const [existing] = await db.select().from(users).where(eq(users.id,id)).limit(1);
    if (!existing) throw new OrderError("Account not found.",404);
    const details = validateAccount(await readJson(request),existing);
    assertMayChangeRole(caller.userId,existing.userId,details.role);
    // SQLite evaluates this joined-admin count inside the same serialized write,
    // preventing two administrators from removing the final usable admin concurrently.
    const retainAdmin = details.role === "admin" ? sql`1 = 1` : sql.raw(KEEP_JOINED_ADMIN_SQL);
    const [row] = await db.update(users).set({name:details.name,role:details.role,updatedAt:new Date().toISOString()})
      .where(and(eq(users.id,id),eq(users.updatedAt,existing.updatedAt),retainAdmin)).returning();
    if (!row) throw new OrderError("Keep at least one signed-in admin. This account may also have changed; refresh before trying again.",409);
    return json({user:serializeAccount(row)});
  });
}
