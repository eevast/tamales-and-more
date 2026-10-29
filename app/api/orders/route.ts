import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { orders } from "../../../db/schema";
import { handleApi, json, readJson, requireUser, serializeOrder } from "../../lib/api";
import { OrderError, matchesSavedOrder, requireReviewedPrice, requireSameOrigin, validateIdempotencyKey, validateOrder } from "../../lib/order-validation";
import { getMenu, snapshotCatalog } from "../../lib/menu";

export const dynamic = "force-dynamic";
export async function GET() {
  return handleApi(async () => {
    const user = await requireUser();
    const rows = await getDb().select().from(orders).where(eq(orders.userId, user.userId)).orderBy(desc(orders.updatedAt));
    return json({ orders: rows.map((row) => serializeOrder(row)) });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const user = await requireUser();
    requireSameOrigin(request);
    const body = await readJson(request);
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey);
    const db = getDb();
    const sameRequest = and(eq(orders.userId, user.userId), eq(orders.idempotencyKey, idempotencyKey));
    const [existing] = await db.select().from(orders).where(sameRequest).limit(1);
    if (existing) {
      const original = serializeOrder(existing);
      const repeated = validateOrder(body, new Date(existing.createdAt), snapshotCatalog(original.items));
      if (!matchesSavedOrder(repeated, original)) throw new OrderError("This request already saved an order with different details. Open My orders to continue with that order.", 409);
      return json({ order: original });
    }
    const validated = validateOrder(body,new Date(),await getMenu());
    requireReviewedPrice(body,validated.totalCents);
    const { items, ...details } = validated;
    const now = new Date().toISOString();
    const inserted = await db.insert(orders).values({
      ...details, id: crypto.randomUUID(), userId: user.userId, idempotencyKey,
      itemsJson: JSON.stringify(items), createdAt: now, updatedAt: now,
      submittedAt: details.status === "in-progress" ? now : null,
    }).onConflictDoNothing({ target: [orders.userId, orders.idempotencyKey] }).returning();
    const row = inserted[0] ?? (await db.select().from(orders).where(sameRequest).limit(1))[0];
    if (!matchesSavedOrder(validated, serializeOrder(row))) throw new OrderError("This request already saved an order with different details. Open My orders to continue with that order.", 409);
    return json({ order: serializeOrder(row) }, inserted.length ? 201 : 200);
  });
}
