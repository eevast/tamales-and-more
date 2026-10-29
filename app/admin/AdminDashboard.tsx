"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChefHat, ChevronRight, CircleCheck, ClipboardList, Clock3, Download, LoaderCircle, PackageCheck, Printer, RefreshCw, Search, ShieldCheck, Users, UtensilsCrossed, Wheat, X } from "lucide-react";
import {itemCount,itemDetails,itemQuantityLabel,orderQuantityLabel,type DisplayItem} from "../orders/order-display";
import MenuManager from "./MenuManager";
import PeopleManager from "./PeopleManager";
import {downloadOrdersCsv} from "./order-export";

type Status = "in-progress" | "completed";
type Order = {
  id: string; number: string; name: string; contactName: string; email: string; phone: string;
  pickupDate: string; notes: string; items: DisplayItem[];
  totalTamales: number; totalCorn: number; totalCents: number; status: Status; adminNote: string;
  createdAt: string; updatedAt: string; submittedAt: string | null;
};
type User = { userId: string; email: string; displayName: string };

const labels: Record<Status, string> = { "in-progress": "In progress", completed: "Completed" };
const nextSteps: Record<Status, { status: Status; label: string }> = {
  "in-progress": {status:"completed",label:"Mark completed"},completed:{status:"in-progress",label:"Reopen order"},
};
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
const dateLabel = (value: string) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not specified";
const localToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || "Something went wrong. Please try again.");
  return body as T;
}

export default function AdminDashboard() {
  const [activeTab,setActiveTab]=useState<"orders"|"menu"|"people">("orders");
  const [user, setUser] = useState<User | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selected = orders.find(order => order.id === selectedId) ?? null;

  const loadOrders = useCallback(async () => {
    const data = await readResponse<{ orders: Order[] }>(await fetch("/api/admin/orders", { cache: "no-store" }));
    setOrders(data.orders);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await readResponse<{ user: User | null; isAdmin: boolean }>(await fetch("/api/me", { cache: "no-store" }));
        if (!active) return;
        setUser(me.user); setAllowed(me.isAdmin);
        if (me.isAdmin) await loadOrders();
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Could not open the kitchen dashboard."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [loadOrders]);

  useEffect(() => { setNote(selected?.adminNote ?? ""); }, [selected?.id, selected?.adminNote]);

  const visibleOrders = useMemo(() => {
    const search = query.trim().toLowerCase();
    return orders.filter(order => (filter === "all" || order.status === filter) && (!search || `${order.number} ${order.name} ${order.contactName} ${order.email} ${order.phone}`.toLowerCase().includes(search)));
  }, [orders, query, filter]);
  const activeOrders = orders.filter(order => order.status === "in-progress");
  const stats = [
    { label: "In progress", value: activeOrders.length, icon: ChefHat, className: "rust" },
    { label: "Completed", value: orders.filter(order => order.status === "completed").length, icon: CircleCheck, className: "olive" },
    { label: "Pickup today", value: activeOrders.filter(order => order.pickupDate === localToday()).length, icon: Clock3, className: "sand" },
    { label: "All orders", value: orders.length, icon: ClipboardList, className: "olive" },
  ];

  async function refresh() {
    setRefreshing(true); setError("");
    try { await loadOrders(); setNotice("Orders are up to date."); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not refresh orders."); }
    finally { setRefreshing(false); }
  }

  async function updateOrder(change: { status?: Status; adminNote?: string }) {
    if (!selected || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await readResponse<{ order: Order }>(await fetch(`/api/admin/orders/${encodeURIComponent(selected.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) }));
      setOrders(current => current.map(order => order.id === data.order.id ? data.order : order));
      setNotice(change.status ? `${data.order.number} is ${labels[data.order.status].toLowerCase()}.` : "Kitchen notes saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update this order."); }
    finally { setBusy(false); }
  }

  function openOrder(order: Order) {
    setSelectedId(order.id); setNotice(""); setError("");
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  return <div className="kitchen-app">
    <header className="kitchen-header">
      <a className="kitchen-brand" href="/"><span className="kitchen-brand-icon"><Wheat size={25} strokeWidth={1.5}/></span><span>Tamales <i>&</i> More<small>GOOD FOOD. GOOD COMPANY.</small></span></a>
      <nav aria-label="Kitchen navigation"><a href="/">Order tamales</a><a href="/orders">My orders</a><span className="kitchen-admin-label"><ShieldCheck size={15}/> Kitchen admin</span></nav>
    </header>
    <main className="kitchen-main">
      <a className="kitchen-back" href="/"><ArrowLeft size={15}/> Back to the storefront</a>
      <div className="kitchen-intro"><div><p className="kitchen-eyebrow">A LITTLE ORGANIZATION. A LOT OF LOVE.</p><h1>The kitchen dashboard</h1><p>Every order, from first hello to the last tamale.</p></div>{allowed && activeTab==="orders" && <button className="kitchen-btn kitchen-btn-light" onClick={refresh} disabled={refreshing || loading}><RefreshCw size={16} className={refreshing ? "kitchen-spin" : ""}/>{refreshing ? "Refreshing…" : "Refresh orders"}</button>}</div>

      {error && <div className="kitchen-alert kitchen-error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={17}/></button></div>}
      {notice && <div className="kitchen-alert kitchen-notice" role="status"><Check size={17}/><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={17}/></button></div>}

      {loading ? <div className="kitchen-gate" role="status"><LoaderCircle className="kitchen-spin" size={28}/><h2>Opening the kitchen</h2><p>Checking your access and gathering orders.</p></div> : !allowed ? <div className="kitchen-gate"><span className="kitchen-gate-icon"><ShieldCheck size={32}/></span><p className="kitchen-eyebrow">FOR THE KITCHEN TEAM</p><h2>{user ? "This account isn’t an administrator" : "Welcome back, kitchen crew."}</h2><p>{user ? `You’re signed in as ${user.email}. Use an approved administrator account to manage customer orders.` : "Sign in with your approved administrator account to confirm orders, prepare batches, and coordinate pickups."}</p><a className="kitchen-btn kitchen-btn-primary" href={user ? "/signout-with-chatgpt?return_to=%2Fadmin" : "/signin-with-chatgpt?return_to=%2Fadmin"} target="_top">{user ? "Sign out to switch accounts" : "Sign in to the kitchen"}<ArrowRight size={17}/></a><a className="kitchen-text-link" href="/orders">Looking for your own orders?</a></div> : <>
        <nav className="kitchen-main-tabs" aria-label="Kitchen sections">{([{id:"orders",label:"Orders",icon:ClipboardList},{id:"menu",label:"Menu & prices",icon:UtensilsCrossed},{id:"people",label:"People",icon:Users}] as const).map(tab=><button key={tab.id} onClick={()=>{setActiveTab(tab.id);setNotice("");setError("");}} className={activeTab===tab.id?"active":""} aria-pressed={activeTab===tab.id}><tab.icon size={16}/>{tab.label}</button>)}</nav>{activeTab==="menu"?<MenuManager/>:activeTab==="people"?<PeopleManager currentEmail={user?.email||""}/>:<><section className="kitchen-stats" aria-label="Order overview">{stats.map(({label,value,icon:Icon,className}) => <div className="kitchen-stat" key={label}><span className={`kitchen-stat-icon ${className}`}><Icon size={21} strokeWidth={1.6}/></span><div><strong>{value}</strong><span>{label}</span></div></div>)}</section>
        <div className={`kitchen-workspace ${selected ? "has-selection" : ""}`}>
          <section className="kitchen-order-list" aria-labelledby="orders-heading">
            <div className="kitchen-list-heading"><h2 id="orders-heading">Orders <span>{orders.length}</span></h2><small>Newest first</small></div><div className="kitchen-export-row"><button disabled={!visibleOrders.length} onClick={()=>downloadOrdersCsv(visibleOrders,"filtered")}><Download size={14}/> Export shown ({visibleOrders.length})</button><button disabled={!orders.length} onClick={()=>downloadOrdersCsv(orders,"all")}>Export all orders</button></div>
            <div className="kitchen-search"><Search size={18}/><input aria-label="Search orders" placeholder="Search name, order number, or contact…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={16}/></button>}</div>
            <div className="kitchen-filters" role="group" aria-label="Filter orders by status">{(["all", "in-progress", "completed"] as const).map(status => <button key={status} aria-pressed={filter === status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status === "all" ? "All orders" : labels[status]}{status === "in-progress" && orders.some(order => order.status === "in-progress") && <span>{orders.filter(order => order.status === "in-progress").length}</span>}</button>)}</div>
            {visibleOrders.length ? <div className="kitchen-orders">{visibleOrders.map(order => <button key={order.id} className={`kitchen-order-row ${selectedId === order.id ? "selected" : ""}`} onClick={() => openOrder(order)} aria-pressed={selectedId === order.id}><div className="kitchen-order-top"><span className="kitchen-order-number">{order.number}</span><span className={`kitchen-status ${order.status}`}>{labels[order.status]}</span></div><div className="kitchen-order-middle"><div><h3>{order.name}</h3><p>{order.contactName}</p></div><strong>{money(order.totalCents)}</strong></div><div className="kitchen-order-bottom"><span>{orderQuantityLabel(order)} <b>·</b> Pickup {dateLabel(order.pickupDate)}</span><ChevronRight size={18}/></div></button>)}</div> : <div className="kitchen-empty"><ClipboardList size={35} strokeWidth={1.3}/><h3>{orders.length ? "No orders match" : "A fresh start for the kitchen"}</h3><p>{orders.length ? "Try another name or choose a different status." : "Submitted orders will appear here, ready for your team to confirm and prepare."}</p>{orders.length > 0 && <button className="kitchen-text-link" onClick={() => {setFilter("all");setQuery("");}}>Clear filters</button>}</div>}
          </section>
          <aside className={`kitchen-detail ${selected ? "is-open" : ""}`} aria-label="Order details">
            {selected ? <>
              <div className="kitchen-detail-top"><span className="kitchen-eyebrow">ORDER DETAILS</span><button className="kitchen-icon-btn" onClick={() => setSelectedId(null)} aria-label="Close order details"><X size={19}/></button></div>
              <div className="kitchen-detail-title"><h2 tabIndex={-1} ref={headingRef}>{selected.name}</h2><p>{selected.number}</p><span className={`kitchen-status ${selected.status}`}>{labels[selected.status]}</span></div>
              <div className="kitchen-pickup"><Clock3 size={20}/><div><small>Requested pickup</small><strong>{dateLabel(selected.pickupDate)}</strong></div></div>
              <section className="kitchen-detail-section"><h3>Customer details</h3><strong>{selected.contactName}</strong><a href={`mailto:${selected.email}`}>{selected.email}</a><a href={`tel:${selected.phone.replace(/[^+\d]/g, "")}`}>{selected.phone}</a></section>
              <section className="kitchen-detail-section"><h3>In this order</h3><div className="kitchen-items">{selected.items.filter(item => item.dozens || item.singles).map(item => <div key={item.flavor}><span><strong>{itemDetails(item).name}</strong><small>{itemQuantityLabel(item)}</small></span><b>{itemCount(item)}</b></div>)}</div><div className="kitchen-total"><span>{orderQuantityLabel(selected)}</span><strong>{money(selected.totalCents)}</strong></div></section>
              {selected.notes && <section className="kitchen-detail-section"><h3>Customer notes</h3><p className="kitchen-note-copy">{selected.notes}</p></section>}
              <section className="kitchen-detail-section kitchen-notes"><label htmlFor="kitchen-note">Kitchen notes <small>Visible to your team</small></label><textarea id="kitchen-note" rows={3} maxLength={2000} placeholder="Pickup arrangements, prep reminders…" value={note} onChange={event => setNote(event.target.value)} disabled={busy}/><p className="kitchen-print-note">{note || "No kitchen notes."}</p><button className="kitchen-btn kitchen-btn-light kitchen-note-save" disabled={busy || note === selected.adminNote} onClick={() => updateOrder({adminNote:note})}>{busy ? "Saving…" : "Save notes"}</button></section>
              <div className="kitchen-actions"><button className="kitchen-btn kitchen-btn-primary" disabled={busy} onClick={() => updateOrder({status:nextSteps[selected.status].status,adminNote:note})}>{busy?<LoaderCircle size={17} className="kitchen-spin"/>:selected.status==="completed"?<RefreshCw size={17}/>:<Check size={18}/>} {nextSteps[selected.status].label}</button><div className="kitchen-secondary-actions"><button className="kitchen-text-link" onClick={()=>window.print()}><Printer size={15}/> Print order</button></div></div>
            </> : <div className="kitchen-detail-empty"><span><ChefHat size={35} strokeWidth={1.2}/></span><h3>From your kitchen,<br/>with care.</h3><p>Select an order to see the details<br/>and keep things moving.</p></div>}
          </aside>
        </div>
        </>}<p className="kitchen-account"><ShieldCheck size={14}/> Signed in as {user?.email}<a href="/signout-with-chatgpt?return_to=%2Fadmin" target="_top">Sign out</a></p>
      </>}
    </main>
    <footer className="kitchen-footer"><span>Tamales & More</span><p>A little masa. A lot of heart.</p></footer>
  </div>;
}




