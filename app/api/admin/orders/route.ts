import { desc, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { handleApi, json, requireUser, serializeOrder } from "../../../lib/api";

export const dynamic = "force-dynamic";
export async function GET() {
  return handleApi(async () => {
    await requireUser(true);
    const rows = await getDb().select().from(orders).where(ne(orders.status, "draft")).orderBy(desc(orders.submittedAt));
    return json({ orders: rows.map((row) => serializeOrder(row, true)) });
  });
}
