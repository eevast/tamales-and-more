import { asc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { menuItems, type MenuRow } from "../../db/schema";
import { FLAVORS, type MenuItem, type OrderItem } from "./catalog";

export function serializeMenuItem(row: MenuRow): MenuItem {
  return {id:row.id,name:row.name,description:row.description,kind:row.kind as MenuItem["kind"],unit:row.unit,dozenCents:row.dozenCents,singleCents:row.singleCents,active:row.active,sortOrder:row.sortOrder};
}

export async function getMenu(activeOnly = false): Promise<MenuItem[]> {
  const db = getDb();
  const now = new Date().toISOString();
  // Defaults are seed data; schema creation stays exclusively in migrations.
  // Conflict-ignore preserves every administrator edit across subsequent visits.
  await db.insert(menuItems).values(FLAVORS.map((item) => ({...item,createdAt:now,updatedAt:now}))).onConflictDoNothing();
  const query = db.select().from(menuItems).orderBy(asc(menuItems.sortOrder),asc(menuItems.name));
  const rows = activeOnly ? await query.where(eq(menuItems.active,true)) : await query;
  return rows.map(serializeMenuItem);
}

export function snapshotCatalog(items: readonly OrderItem[]): MenuItem[] {
  return items.map((item,index) => {
    const original = FLAVORS.find((entry) => entry.id === item.flavor);
    return {id:item.flavor,name:item.name ?? original?.name ?? "Unavailable item",description:"",kind:item.kind ?? original?.kind ?? "side",unit:item.unit ?? original?.unit ?? "order",dozenCents:item.dozenCents ?? original?.dozenCents ?? 0,singleCents:item.singleCents ?? original?.singleCents ?? 0,active:true,sortOrder:index};
  });
}
