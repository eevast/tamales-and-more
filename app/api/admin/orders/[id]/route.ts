import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { orders } from "../../../../../db/schema";
import { handleApi, json, readJson, requireUser, serializeOrder } from "../../../../lib/api";
import { normalizeOrderStatus } from "../../../../lib/catalog";
import { OrderError, requireSameOrigin, validateAdminUpdate } from "../../../../lib/order-validation";

export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    await requireUser(true);
    requireSameOrigin(request);
    const { id } = await context.params;
    const db = getDb();
    const [existing] = await db.select().from(orders).where(and(eq(orders.id, id), ne(orders.status, "draft"))).limit(1);
    if (!existing) throw new OrderError("Order not found.", 404);
    const updates = validateAdminUpdate(await readJson(request), normalizeOrderStatus(existing.status));
    const [row] = await db.update(orders).set({ ...updates, updatedAt: new Date().toISOString() })
      .where(and(eq(orders.id, id), eq(orders.status, existing.status), eq(orders.updatedAt, existing.updatedAt))).returning();
    if (!row) throw new OrderError("Another team member updated this order. Refresh to see its latest status.", 409);
    return json({ order: serializeOrder(row, true) });
  });
}
