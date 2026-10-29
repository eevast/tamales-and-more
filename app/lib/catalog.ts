export type MenuItem = {
  id: string; name: string; description: string; kind: "tamale" | "side"; unit: string;
  dozenCents: number; singleCents: number; active: boolean; sortOrder: number;
};

export const FLAVORS: readonly MenuItem[] = [
  { id: "chicken", kind: "tamale", unit: "tamale", name: "Chicken", description: "A savory classic, wrapped and ready to share.", dozenCents: 3000, singleCents: 250, active:true, sortOrder:0 },
  { id: "pork", kind: "tamale", unit: "tamale", name: "Pork", description: "Rich, comforting flavor in every bite.", dozenCents: 3000, singleCents: 250, active:true, sortOrder:1 },
  { id: "beef", kind: "tamale", unit: "tamale", name: "Beef", description: "A hearty favorite for your next gathering.", dozenCents: 3600, singleCents: 300, active:true, sortOrder:2 },
  { id: "cheese", kind: "tamale", unit: "tamale", name: "Cheese & Jalapeño", description: "Creamy cheese with a little jalapeño warmth.", dozenCents: 3000, singleCents: 250, active:true, sortOrder:3 },
  { id: "corn", kind: "side", unit: "order", name: "Corn", description: "Add a corn order to your meal.", dozenCents: 0, singleCents: 1800, active:true, sortOrder:4 },
];

export type FlavorId = (typeof FLAVORS)[number]["id"];
export type OrderItem = {
  flavor: FlavorId; dozens: number; singles: number;
  name?: string; kind?: "tamale" | "side"; unit?: string; dozenCents?: number; singleCents?: number;
};
export const ORDER_STATUSES = ["draft", "in-progress", "completed"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const normalizeOrderStatus = (status: string): OrderStatus => status === "draft" || status === "completed" ? status : "in-progress";
export type Order = {
  id: string; number: string; name: string; contactName: string; email: string;
  phone: string; pickupDate: string; notes: string; items: OrderItem[];
  totalTamales: number; totalCorn: number; totalSides: number; totalItems: number; totalCents: number; status: OrderStatus;
  createdAt: string; updatedAt: string; submittedAt: string | null; adminNote?: string;
};

export function summarizeQuantities(items: readonly OrderItem[], catalog: readonly MenuItem[] = FLAVORS) {
  return items.reduce((total, item) => {
    const kind = item.kind ?? catalog.find((entry) => entry.id === item.flavor)?.kind;
    if (!kind) throw new Error("Unknown menu item");
    const tamales = kind === "tamale" ? item.dozens * 12 + item.singles : 0;
    const sides = kind === "side" ? item.singles : 0;
    const corn = item.flavor === "corn" ? sides : 0;
    return {
      totalTamales: total.totalTamales + tamales,
      totalCorn: total.totalCorn + corn,
      totalSides: total.totalSides + sides,
      totalItems: total.totalItems + tamales + sides,
    };
  }, { totalTamales: 0, totalCorn: 0, totalSides: 0, totalItems: 0 });
}

export function calculateTotal(items: readonly OrderItem[], catalog: readonly MenuItem[] = FLAVORS) {
  const totalCents = items.reduce((total, item) => {
    const flavor = catalog.find((entry) => entry.id === item.flavor);
    if (!flavor) throw new Error("Unknown menu item");
    return total + (flavor.kind === "tamale" ? item.dozens * flavor.dozenCents : 0) + item.singles * flavor.singleCents;
  }, 0);
  return { ...summarizeQuantities(items.map(({flavor,dozens,singles}) => ({flavor,dozens,singles})), catalog), totalCents };
}

export const formatMoney = (cents: number) => new Intl.NumberFormat("en-US", {style:"currency", currency:"USD"}).format(cents / 100);
