import { handleApi, json } from "../../lib/api";
import { getMenu } from "../../lib/menu";
export const dynamic = "force-dynamic";
export async function GET() {
  return handleApi(async () => json({items:await getMenu(true)}));
}
