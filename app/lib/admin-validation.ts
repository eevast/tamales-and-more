import { type MenuItem } from "./catalog";
import { OrderError } from "./order-validation";

export const KEEP_JOINED_ADMIN_SQL = "(role <> 'admin' OR user_id IS NULL OR (SELECT COUNT(*) FROM users WHERE role = 'admin' AND user_id IS NOT NULL) > 1)";
export function assertMayChangeRole(callerUserId: string, targetUserId: string | null, newRole: string) {
  if (callerUserId === targetUserId && newRole !== "admin") throw new OrderError("You cannot remove your own admin access. Another signed-in admin can change your role.",409);
}

function text(value: unknown, label: string, max: number, required = true) {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new OrderError(`${label} must be ${required ? "non-empty text" : "text"} up to ${max} characters.`);
  return value.trim();
}
function price(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 10000000) throw new OrderError(`${label} must be a positive whole number of cents, up to $100,000.`);
  return value as number;
}

export function validateMenuItem(input: unknown, existing?: MenuItem) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new OrderError("Enter valid menu details.");
  const body = input as Record<string, unknown>;
  const merged = {...existing,...body};
  const kind = merged.kind;
  if (kind !== "tamale" && kind !== "side") throw new OrderError("Choose Tamale or Side as the item type.");
  if (existing && kind !== existing.kind) throw new OrderError("An existing item's type cannot change. Add a new item instead.");
  const active = merged.active ?? true;
  if (typeof active !== "boolean") throw new OrderError("Availability must be on or off.");
  const sortOrder = merged.sortOrder ?? 100;
  if (!Number.isInteger(sortOrder) || (sortOrder as number) < 0 || (sortOrder as number) > 100000) throw new OrderError("Display order must be a whole number from 0 to 100,000.");
  const name = text(merged.name,"Name",100);
  const description = text(merged.description ?? "","Description",500,false);
  const unit = kind === "tamale" ? "tamale" : text(merged.unit,"Unit",40);
  if (kind === "side" && /dozen|tamale/i.test(unit)) throw new OrderError("Choose a side unit such as order, tray, or container.");
  const singleCents = price(merged.singleCents,"Unit price");
  const dozenCents = kind === "tamale" ? price(merged.dozenCents,"Dozen price") : 0;
  return {name,description,kind,unit,dozenCents,singleCents,active,sortOrder:sortOrder as number} as Omit<MenuItem,"id">;
}

export function validateAccount(input: unknown, existing?: {name:string;role:string;email:string}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new OrderError("Enter valid account details.");
  const body = input as Record<string, unknown>;
  const merged = {...existing,...body};
  const name = text(merged.name,"Name",120);
  const email = text(merged.email,"Email",254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new OrderError("Enter a valid email address.");
  if (existing && email !== existing.email) throw new OrderError("An account email cannot be changed here.");
  const role = merged.role ?? "customer";
  if (role !== "customer" && role !== "admin") throw new OrderError("Choose Customer or Admin.");
  return {name,email,role} as {name:string;email:string;role:"customer"|"admin"};
}
