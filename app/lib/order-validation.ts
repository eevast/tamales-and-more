import { FLAVORS, calculateTotal, type MenuItem, type OrderItem, type OrderStatus } from "./catalog";

export class OrderError extends Error {
  constructor(message: string, public status = 400, public fields?: Record<string, string>) {
    super(message);
    this.name = "OrderError";
  }
}

export function chicagoDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function textField(body: Record<string, unknown>, key: string, max: number, fields: Record<string, string>) {
  if (body[key] === undefined || body[key] === null) return "";
  if (typeof body[key] !== "string") { fields[key] = "Enter text for this field."; return ""; }
  const value = (body[key] as string).trim();
  if (value.length > max) fields[key] = `Use ${max} characters or fewer.`;
  return value;
}

export function validateOrder(input: unknown, now = new Date(), catalog: readonly MenuItem[] = FLAVORS) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new OrderError("Enter valid order details.");
  const body = input as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const status = body.status ?? "draft";
  if (status !== "draft" && status !== "in-progress") fields.status = "An order can only be saved as a draft or placed in progress.";
  const name = textField(body, "name", 100, fields);
  const contactName = textField(body, "contactName", 100, fields);
  const email = textField(body, "email", 254, fields).toLowerCase();
  const phone = textField(body, "phone", 32, fields);
  const pickupDate = textField(body, "pickupDate", 10, fields);
  const notes = textField(body, "notes", 2000, fields);
  if (status === "in-progress") {
    if (!name) fields.name = "Give your order a name.";
    if (!contactName) fields.contactName = "Enter the pickup contact's full name.";
    if (!email) fields.email = "Enter your contact email.";
    if (!phone) fields.phone = "Enter a phone number so we can confirm your order.";
    if (!pickupDate) fields.pickupDate = "Choose a requested pickup date.";
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = "Enter a valid email address.";
  if (phone && (phone.replace(/\D/g, "").length < 10 || phone.replace(/\D/g, "").length > 15 || !/^[\d\s()+.\-]+$/.test(phone))) fields.phone = "Enter a valid phone number with 10–15 digits.";
  if (pickupDate) {
    const parsed = new Date(`${pickupDate}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== pickupDate) fields.pickupDate = "Choose a valid pickup date.";
    else if (status === "in-progress" && pickupDate < chicagoDate(now)) fields.pickupDate = "Choose today or a future pickup date.";
  }
  const items: OrderItem[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 200) {
    fields.items = "Choose at least one menu item. Each item can appear once.";
  } else {
    for (const row of body.items) {
      if (!row || typeof row !== "object" || Array.isArray(row)) { fields.items = "Choose a valid menu item and quantity."; continue; }
      const item = row as Record<string, unknown>;
      // Empty editor rows are not order lines. Ignoring them also lets an exact
      // retry use its saved snapshot after the available menu has changed.
      if (item.dozens === 0 && item.singles === 0) continue;
      const flavor = catalog.find((entry) => entry.id === item.flavor);
      if (!flavor || seen.has(flavor.id)) { fields.items = "Choose each available menu item only once."; continue; }
      seen.add(flavor.id);
      if (status === "in-progress" && !flavor.active && ((item.dozens as number) > 0 || (item.singles as number) > 0)) { fields.items = `${flavor.name} is currently unavailable. Remove it before submitting.`; continue; }
      const snapshot = {name:flavor.name,kind:flavor.kind,unit:flavor.unit,dozenCents:flavor.dozenCents,singleCents:flavor.singleCents};
      if (flavor.kind === "side") {
        if (item.dozens !== 0) fields.items = `${flavor.name} is sold by the ${flavor.unit}, not by the dozen.`;
        else if (!Number.isInteger(item.singles) || (item.singles as number) < 0 || (item.singles as number) > 1000) fields.items = "Side quantities must be a whole number from 0 to 1,000.";
        else if ((item.singles as number) > 0) items.push({ flavor: flavor.id, dozens: 0, singles: item.singles as number, ...snapshot });
      }
      else if (!Number.isInteger(item.dozens) || (item.dozens as number) < 0 || (item.dozens as number) > 1000) fields.items = "Dozens must be a whole number from 0 to 1,000.";
      else if (!Number.isInteger(item.singles) || (item.singles as number) < 0 || (item.singles as number) > 11) fields.items = "Extra singles must be a whole number from 0 to 11.";
      else if ((item.dozens as number) > 0 || (item.singles as number) > 0) items.push({ flavor: flavor.id, dozens: item.dozens as number, singles: item.singles as number, ...snapshot });
    }
    if (!items.length && !fields.items) fields.items = "Add at least one item to your order.";
  }
  if (Object.keys(fields).length) throw new OrderError("Please check the highlighted order details.", 400, fields);
  const { totalTamales, totalCents } = calculateTotal(items, catalog);
  return { name: name || "Untitled order", contactName, email, phone, pickupDate, notes, items, status: status as "draft" | "in-progress", totalTamales, totalCents };
}

export function validateIdempotencyKey(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new OrderError("A valid order request key is required. Refresh and try again.");
  return value;
}

export function requireReviewedPrice(input: Record<string,unknown>, totalCents: number) {
  if (input.status !== "in-progress" || input.expectedTotalCents === undefined) return;
  if (!Number.isSafeInteger(input.expectedTotalCents) || input.expectedTotalCents !== totalCents) throw new OrderError("Menu prices changed since your review. Refresh the menu and review your updated total before submitting.",409);
}

export function matchesSavedOrder(requested: ReturnType<typeof validateOrder>, saved: {
  name: string; contactName: string; email: string; phone: string; pickupDate: string; notes: string;
  items: OrderItem[]; totalTamales: number; totalCents: number; status: OrderStatus;
}) {
  const fields = ["name", "contactName", "email", "phone", "pickupDate", "notes", "totalTamales", "totalCents"] as const;
  if (fields.some((field) => requested[field] !== saved[field])) return false;
  if ((requested.status === "draft") !== (saved.status === "draft")) return false;
  const canonicalItems = (items: OrderItem[]) => [...items].sort((a, b) => a.flavor.localeCompare(b.flavor)).map(({flavor,dozens,singles}) => `${flavor}:${dozens}:${singles}`).join("|");
  return canonicalItems(requested.items) === canonicalItems(saved.items);
}

export function emailIsAdmin(email: string | undefined | null, allowlist: string | undefined | null) {
  if (!email || !allowlist) return false;
  return allowlist.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());
}

export function validateAdminUpdate(input: unknown, currentStatus: OrderStatus) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new OrderError("Enter a valid order update.");
  const body = input as Record<string, unknown>;
  const update: {status?: OrderStatus; adminNote?: string} = {};
  if (body.status !== undefined) {
    if (body.status !== "in-progress" && body.status !== "completed") throw new OrderError("Choose In progress or Completed.");
    const status = body.status as OrderStatus;
    if (currentStatus === "draft") throw new OrderError("Drafts must be submitted by their owner before processing.",409);
    update.status = status;
  }
  if (body.adminNote !== undefined) {
    if (typeof body.adminNote !== "string" || body.adminNote.length > 2000) throw new OrderError("Kitchen notes must be text up to 2,000 characters.");
    update.adminNote = body.adminNote.trim();
  }
  if (!Object.keys(update).length) throw new OrderError("Choose a status or enter a kitchen note.");
  return update;
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new OrderError("This request must come from the order website.", 403);
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new OrderError("Send order details as JSON.", 415);
}
