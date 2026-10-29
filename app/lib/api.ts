import { getChatGPTUser, type ChatGPTUser } from "../chatgpt-auth";
import { type OrderRow } from "../../db/schema";
import { summarizeQuantities, normalizeOrderStatus, type Order, type OrderItem } from "./catalog";
import { OrderError } from "./order-validation";
import { getOrCreateAccount } from "./accounts";

export async function isAdmin(user: ChatGPTUser | null) {
  return user ? (await getOrCreateAccount(user)).role === "admin" : false;
}

export async function requireUser(admin = false) {
  const user = await getChatGPTUser();
  if (!user) throw new OrderError("Sign in to save and submit your orders.", 401);
  const account = await getOrCreateAccount(user);
  if (admin && account.role !== "admin") throw new OrderError("This account does not have kitchen access.", 403);
  return user;
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Cookie" } });
}

export async function handleApi(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof OrderError) return json({ error: error.message, ...(error.fields ? { fields: error.fields } : {}) }, error.status);
    console.error("Order storage operation failed.");
    return json({ error: "We could not load or save your order. Please try again." }, 503);
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") ?? 0) > 32768) throw new OrderError("The order is too large.", 413);
  if (!request.body) throw new OrderError("Enter order details.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 32768) { await reader.cancel(); throw new OrderError("The order is too large.", 413); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new OrderError("The order details could not be read. Refresh and try again."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new OrderError("Enter valid order details.");
  return body as Record<string, unknown>;
}

export function serializeOrder(row: OrderRow, admin = false): Order {
  const items: OrderItem[] = JSON.parse(row.itemsJson);
  const { totalCorn, totalSides, totalItems } = summarizeQuantities(items);
  return {
    id: row.id, number: `TM-${row.id.slice(0, 8).toUpperCase()}`,
    name: row.name, contactName: row.contactName, email: row.email, phone: row.phone,
    pickupDate: row.pickupDate, notes: row.notes, items,
    totalTamales: row.totalTamales, totalCorn, totalSides, totalItems, totalCents: row.totalCents,
    status: normalizeOrderStatus(row.status), createdAt: row.createdAt, updatedAt: row.updatedAt,
    submittedAt: row.submittedAt, ...(admin ? { adminNote: row.adminNote } : {}),
  };
}
