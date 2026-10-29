"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Check, ChevronDown, ChevronUp, Clock3, FilePenLine, History, LoaderCircle, PackageCheck, Plus, RefreshCw, ShoppingBag, UserRound } from "lucide-react";
import { Header, Footer, type Identity } from "../Shell";
import { formatMoney, type Order, type OrderStatus } from "../lib/catalog";
import {itemCount,itemDetails,itemQuantityLabel,orderQuantityLabel,pluralUnit} from "./order-display";

type Filter = "all" | "active" | "drafts" | "history";
const statusLabels: Record<OrderStatus, string> = { draft:"Saved draft", "in-progress":"In progress", completed:"Completed" };
const statusMessages: Record<OrderStatus, string> = {
  draft:"Pick up where you left off. Your draft hasn’t been sent to the kitchen.",
  "in-progress":"Your order is with the kitchen. We’ll use your contact details to arrange pickup.",
  completed:"Thank you for sharing a little comfort with us.",
};
const isActive = (order: Order) => order.status === "in-progress";
const isHistory = (order: Order) => order.status === "completed";
const dateLabel = (value: string) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {month:"short",day:"numeric",year:"numeric"}) : "Choose a date when you’re ready";

async function responseBody<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & {error?:string};
  if (!response.ok) throw new Error(data.error || "We couldn’t load your orders. Please try again.");
  return data;
}

export default function MyOrders() {
  const [identity,setIdentity] = useState<Identity|null>(null);
  const [orders,setOrders] = useState<Order[]>([]);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [error,setError] = useState("");
  const [filter,setFilter] = useState<Filter>("all");
  const [expanded,setExpanded] = useState<string|null>(null);

  const load = useCallback(async () => {
    const me = await responseBody<Identity>(await fetch("/api/me", {cache:"no-store"}));
    setIdentity(me);
    if (me.user) {
      const data = await responseBody<{orders:Order[]}>(await fetch("/api/orders", {cache:"no-store"}));
      setOrders(data.orders);
    } else setOrders([]);
  }, []);

  useEffect(() => { load().catch(err => setError(err instanceof Error ? err.message : "We couldn’t load your orders.")).finally(() => setLoading(false)); }, [load]);

  const counts = useMemo(() => ({all:orders.length,active:orders.filter(isActive).length,drafts:orders.filter(order=>order.status==="draft").length,history:orders.filter(isHistory).length}),[orders]);
  const shown = orders.filter(order => filter === "all" || (filter === "active" ? isActive(order) : filter === "drafts" ? order.status === "draft" : isHistory(order)));

  async function refresh() {
    setRefreshing(true); setError("");
    try { await load(); } catch(err) {setError(err instanceof Error ? err.message : "We couldn’t refresh your orders.");}
    finally {setRefreshing(false);}
  }

  return <div className="saved-orders-app">
    <Header active="orders" identity={identity ?? undefined} key={identity?.user?.userId ?? "guest"}/>
    <main className="saved-orders-main">
      <div className="saved-orders-intro"><div><p className="saved-orders-eyebrow">YOUR LITTLE CORNER OF THE KITCHEN</p><h1>Good things, saved.</h1><p>Your favorites, your plans, and every order in between.</p></div><a className="saved-orders-btn saved-orders-primary" href="/#menu"><Plus size={17}/> Start a new order</a></div>
      {error && <div className="saved-orders-error" role="alert"><span>{error}</span><button onClick={refresh} disabled={refreshing}>{refreshing ? "Trying again…" : "Try again"}</button></div>}
      {loading ? <section className="saved-orders-gate" role="status"><LoaderCircle size={30} className="saved-orders-spin"/><h2>Gathering your orders</h2><p>Your saved favorites will be right here.</p></section> : !identity?.user ? <section className="saved-orders-gate"><span className="saved-orders-gate-icon"><UserRound size={32} strokeWidth={1.4}/></span><p className="saved-orders-eyebrow">WELCOME TO YOUR TABLE</p><h2>A place for all your favorites.</h2><p>Sign in to save an order for later, follow its progress, and make your next tamale night a little easier.</p><a className="saved-orders-btn saved-orders-primary" href="/signin-with-chatgpt?return_to=%2Forders" target="_top">Sign in to view your orders<ArrowRight size={17}/></a><a className="saved-orders-text-link" href="/#menu">Explore the menu</a></section> : <>
        <div className="saved-orders-welcome"><span><UserRound size={16}/> {identity.user.displayName}</span><button onClick={refresh} disabled={refreshing} className="saved-orders-refresh"><RefreshCw size={13} className={refreshing ? "saved-orders-spin" : ""}/>{refreshing ? "Refreshing…" : "Refresh orders"}</button></div>
        <section className="saved-orders-overview" aria-label="Your order overview"><div><span className="saved-orders-summary-icon"><ShoppingBag size={21} strokeWidth={1.5}/></span><div><strong>{counts.active}</strong><p>Active {counts.active === 1 ? "order" : "orders"}</p></div></div><div><span className="saved-orders-summary-icon"><FilePenLine size={21} strokeWidth={1.5}/></span><div><strong>{counts.drafts}</strong><p>Saved {counts.drafts === 1 ? "draft" : "drafts"}</p></div></div><div><span className="saved-orders-summary-icon"><History size={21} strokeWidth={1.5}/></span><div><strong>{counts.history}</strong><p>Past {counts.history === 1 ? "order" : "orders"}</p></div></div></section>
        <div className="saved-orders-list-heading"><div className="saved-orders-tabs" role="group" aria-label="Filter your orders">{([{key:"all",label:"All orders"},{key:"active",label:"Active"},{key:"drafts",label:"Saved drafts"},{key:"history",label:"Order history"}] as const).map(tab=><button key={tab.key} onClick={()=>setFilter(tab.key)} aria-pressed={filter===tab.key} className={filter===tab.key?"active":""}>{tab.label}<span>{counts[tab.key]}</span></button>)}</div><small>Newest first</small></div>
        {shown.length ? <section className="saved-orders-grid" aria-label="Your orders">{shown.map(order => {
          const detailsOpen = expanded === order.id;

          return <article className={`saved-order-card ${order.status}`} key={order.id}>
            <div className="saved-order-topline"><span>{order.number}</span><span className={`saved-order-status ${order.status}`}>{order.status==="completed"&&<PackageCheck size={13}/>} {statusLabels[order.status]}</span></div>
            <div className="saved-order-title"><h2>{order.name}</h2><strong>{formatMoney(order.totalCents)}</strong></div>
            <div className="saved-order-pickup"><CalendarDays size={14}/><span>{order.pickupDate ? `Requested pickup · ${dateLabel(order.pickupDate)}` : dateLabel(order.pickupDate)}</span></div>
            <div className="saved-order-flavors">{order.items.filter(item=>item.dozens||item.singles).map(item=><span key={item.flavor}>{itemDetails(item).kind==="side" ? <>{itemDetails(item).name} · <b>{item.singles}</b> {pluralUnit(itemDetails(item).unit,item.singles)}</> : <><b>{itemCount(item)}</b> {itemDetails(item).name}</>}</span>)}</div>
            <p className="saved-order-quantity">{orderQuantityLabel(order)}</p>
            {order.status!=="draft"&&<div className={`saved-order-state ${order.status}`}>{order.status==="completed"?<Check size={16}/>:<Clock3 size={16}/>}<span>{order.status==="completed"?"Order completed":"Your order is in progress"}</span></div>}
            <p className="saved-order-message">{order.status==="draft"&&<FilePenLine size={15}/>} {statusMessages[order.status]}</p>
            {detailsOpen && <div className="saved-order-details" id={`details-${order.id}`}>
              <h3>Order breakdown</h3><ul>{order.items.filter(item=>item.dozens||item.singles).map(item=><li key={item.flavor}><strong>{itemDetails(item).name}</strong><span>{itemQuantityLabel(item)}</span></li>)}</ul>
              <h3>Pickup contact</h3><p>{order.contactName || "Not added yet"}</p>{order.email&&<p>{order.email}</p>}{order.phone&&<p>{order.phone}</p>}
              {order.notes&&<><h3>Your notes</h3><p className="saved-order-notes">{order.notes}</p></>}
            </div>}
            <div className="saved-order-actions"><button onClick={()=>setExpanded(detailsOpen?null:order.id)} aria-expanded={detailsOpen} aria-controls={`details-${order.id}`}> {detailsOpen?"Hide details":"Order details"}{detailsOpen?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</button><a className={order.status==="draft"?"saved-order-resume":"saved-order-reorder"} href={order.status==="draft"?`/?edit=${encodeURIComponent(order.id)}#menu`:`/?reorder=${encodeURIComponent(order.id)}#menu`}>{order.status==="draft"?"Finish this order":"Order again"}<ArrowRight size={14}/></a></div>
          </article>;
        })}</section> : <section className="saved-orders-empty"><span><ShoppingBag size={36} strokeWidth={1.2}/></span><h2>{orders.length ? filter==="drafts"?"No plans on the back burner." : filter==="active"?"Nothing in the kitchen just yet." : "Fresh beginnings taste good." : "Your next gathering starts here."}</h2><p>{orders.length ? filter==="drafts"?"Build an order and save it as a draft. It’ll be waiting right here when you’re ready." : filter==="active"?"Your submitted orders will appear here as the kitchen gets them ready." : "Completed orders will appear here for easy reordering." : "Build a dozen, add a few extras, and save your favorites for another day."}</p><a className="saved-orders-btn saved-orders-primary" href="/#menu">Find your favorites<ArrowRight size={16}/></a></section>}
        {orders.length>0 && <div className="saved-orders-footnote"><Clock3 size={15}/><p>Pickup dates are requests until confirmed by the kitchen. Reorders use the current menu prices.</p></div>}
      </>}
    </main>
    <Footer/>
  </div>;
}



