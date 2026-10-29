import { getChatGPTUser } from "../../chatgpt-auth";
import { handleApi, json } from "../../lib/api";
import { getOrCreateAccount } from "../../lib/accounts";

export const dynamic = "force-dynamic";
export async function GET() {
  return handleApi(async () => {
    const user = await getChatGPTUser();
    const account = user ? await getOrCreateAccount(user) : null;
    return json({ user: user && account ? {userId: user.userId, accountId:account.id, email: user.email, displayName: account.name} : null, isAdmin: account?.role === "admin" });
  });
}
