import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { menuItems } from "../../../../../db/schema";
import { handleApi, json, readJson, requireUser } from "../../../../lib/api";
import { OrderError, requireSameOrigin } from "../../../../lib/order-validation";
import { validateMenuItem } from "../../../../lib/admin-validation";
import { serializeMenuItem } from "../../../../lib/menu";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: {params:Promise<{id:string}>}) {
  return handleApi(async () => {
    await requireUser(true); requireSameOrigin(request);
    const {id} = await context.params; const db = getDb();
    const [existing] = await db.select().from(menuItems).where(eq(menuItems.id,id)).limit(1);
    if (!existing) throw new OrderError("Menu item not found.",404);
    const details = validateMenuItem(await readJson(request),serializeMenuItem(existing));
    const [row] = await db.update(menuItems).set({...details,updatedAt:new Date().toISOString()}).where(and(eq(menuItems.id,id),eq(menuItems.updatedAt,existing.updatedAt))).returning();
    if (!row) throw new OrderError("This menu item changed. Refresh and try again.",409);
    return json({item:serializeMenuItem(row)});
  });
}
