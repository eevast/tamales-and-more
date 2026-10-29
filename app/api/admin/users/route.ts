import { asc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { handleApi, json, readJson, requireUser } from "../../../lib/api";
import { OrderError, requireSameOrigin } from "../../../lib/order-validation";
import { validateAccount } from "../../../lib/admin-validation";
import { serializeAccount } from "../../../lib/accounts";
export const dynamic = "force-dynamic";
export async function GET() {
  return handleApi(async () => {
    await requireUser(true);
    const rows = await getDb().select().from(users).orderBy(asc(users.name));
    return json({users:rows.map(serializeAccount)});
  });
}
export async function POST(request: Request) {
  return handleApi(async () => {
    await requireUser(true); requireSameOrigin(request);
    const details = validateAccount(await readJson(request));
    const now = new Date().toISOString();
    const [row] = await getDb().insert(users).values({...details,id:crypto.randomUUID(),createdAt:now,updatedAt:now}).onConflictDoNothing().returning();
    if (!row) throw new OrderError("An account with this email already exists. Edit that account instead.",409);
    return json({user:serializeAccount(row)},201);
  });
}
