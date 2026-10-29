import { getDb } from "../../../../db";
import { menuItems } from "../../../../db/schema";
import { handleApi, json, readJson, requireUser } from "../../../lib/api";
import { requireSameOrigin } from "../../../lib/order-validation";
import { validateMenuItem } from "../../../lib/admin-validation";
import { getMenu, serializeMenuItem } from "../../../lib/menu";
export const dynamic = "force-dynamic";
export async function GET() {
  return handleApi(async () => { await requireUser(true); return json({items:await getMenu()}); });
}
export async function POST(request: Request) {
  return handleApi(async () => {
    await requireUser(true); requireSameOrigin(request);
    const details = validateMenuItem(await readJson(request));
    const now = new Date().toISOString();
    const [row] = await getDb().insert(menuItems).values({...details,id:crypto.randomUUID(),createdAt:now,updatedAt:now}).returning();
    return json({item:serializeMenuItem(row)},201);
  });
}
