import { FLAVORS } from "../lib/catalog";

export type DisplayItem = {flavor:string;dozens:number;singles:number;name?:string;kind?:"tamale"|"side";unit?:string;dozenCents?:number;singleCents?:number};
export function itemDetails(item: DisplayItem) {
  const fallback = FLAVORS.find(entry => entry.id === item.flavor);
  return {name:item.name || fallback?.name || item.flavor,kind:item.kind || (fallback?.kind === "tamale" ? "tamale" : "side"),unit:item.unit || fallback?.unit || "order",dozenCents:item.dozenCents ?? fallback?.dozenCents ?? 0,singleCents:item.singleCents ?? fallback?.singleCents ?? 0};
}
export function pluralUnit(unit:string, quantity:number) {
  if(quantity===1 || unit.endsWith("s")) return unit;
  return `${unit}s`;
}
export function itemCount(item:DisplayItem) {return itemDetails(item).kind==="tamale"?item.dozens*12+item.singles:item.singles;}
export function itemQuantityLabel(item:DisplayItem) {
  const details=itemDetails(item);
  if(details.kind==="side")return `${item.singles} ${pluralUnit(details.unit,item.singles)}`;
  return [item.dozens?`${item.dozens} dozen`:"",item.singles?`${item.singles} ${item.singles===1?"single":"singles"}`:""].filter(Boolean).join(" + ");
}
export function orderQuantityLabel(order:{totalTamales:number;items:DisplayItem[]}) {
  const parts=order.totalTamales?[`${order.totalTamales} ${order.totalTamales===1?"tamale":"tamales"}`]:[];
  for(const item of order.items){const details=itemDetails(item);if(details.kind==="side"&&item.singles)parts.push(`${item.singles} ${details.name} ${pluralUnit(details.unit,item.singles)}`);}
  return parts.join(" + ");
}
