import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { handleApi, json, readJson, requireUser, serializeOrder } from "../../../lib/api";
import { OrderError, matchesSavedOrder, requireReviewedPrice, requireSameOrigin, validateOrder } from "../../../lib/order-validation";
import { getMenu, snapshotCatalog } from "../../../lib/menu";

export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser();
    requireSameOrigin(request);
    const { id } = await context.params;
    const db = getDb();
    const ownedOrder = and(eq(orders.id, id), eq(orders.userId, user.userId));
    const [existing] = await db.select().from(orders).where(ownedOrder).limit(1);
    if (!existing) throw new OrderError("Order not found.", 404);
    const body = await readJson(request);
    if (existing.status !== "draft") {
      const original = serializeOrder(existing);
      if (body.status === "in-progress" && matchesSavedOrder(validateOrder(body, new Date(existing.submittedAt ?? existing.createdAt),snapshotCatalog(original.items)), original)) return json({ order: original });
      throw new OrderError("Submitted orders are managed by the kitchen. You can start a new order from this one.", 409);
    }
    const { items, ...details } = validateOrder(body,new Date(),await getMenu());
    requireReviewedPrice(body,details.totalCents);
    const now = new Date().toISOString();
    const [row] = await db.update(orders).set({
      ...details, itemsJson: JSON.stringify(items), updatedAt: now,
      submittedAt: details.status === "in-progress" ? now : null,
    }).where(and(ownedOrder, eq(orders.status, "draft"), eq(orders.updatedAt, existing.updatedAt))).returning();
    if (!row) throw new OrderError("This order changed in another window. Refresh your orders to continue.", 409);
    return json({ order: serializeOrder(row) });
  });
}
