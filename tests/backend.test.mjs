import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";

// Compile the pure validation modules for Node without adding a test runtime dependency.
const buildDirectory = path.resolve("work/backend-tests");
await mkdir(buildDirectory, { recursive: true });
for (const filename of ["catalog", "order-validation", "admin-validation"]) {
  const source = await readFile(`app/lib/${filename}.ts`, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  await writeFile(path.join(buildDirectory, `${filename}.mjs`), compiled.replace(/from "\.\/([^"]+)"/g, 'from "./$1.mjs"'));
}
const { FLAVORS, calculateTotal, summarizeQuantities } = await import(pathToFileURL(path.join(buildDirectory, "catalog.mjs")));
const { OrderError, validateOrder, validateAdminUpdate, validateIdempotencyKey, matchesSavedOrder, emailIsAdmin, requireSameOrigin, requireReviewedPrice, chicagoDate } = await import(pathToFileURL(path.join(buildDirectory, "order-validation.mjs")));
const { validateMenuItem, validateAccount, assertMayChangeRole, KEEP_JOINED_ADMIN_SQL } = await import(pathToFileURL(path.join(buildDirectory, "admin-validation.mjs")));
const now = new Date("2026-10-29T23:30:00Z");
const valid = { name: "Friday family dinner", contactName: "Sample Customer", email: "customer@example.com", phone: "312-555-0100", pickupDate: "2026-10-30", notes: "", status: "in-progress", items: [{flavor:"chicken",dozens:2,singles:3}] };
const rejects = (body, field) => assert.throws(() => validateOrder(body, now), (error) => error instanceof OrderError && Boolean(error.fields?.[field]));

test("prices dozens and offsets in integer cents and totals all flavors", () => {
  assert.deepEqual(calculateTotal([{flavor:"chicken",dozens:10,singles:11},{flavor:"corn",dozens:0,singles:1}]), {totalTamales:131,totalCorn:1,totalSides:1,totalItems:132,totalCents:34550});
  assert.deepEqual(calculateTotal([{flavor:"beef",dozens:2,singles:3},{flavor:"cheese",dozens:1,singles:1}]), {totalTamales:40,totalCorn:0,totalSides:0,totalItems:40,totalCents:11350});
  assert.equal(validateOrder({...valid,items:[{flavor:"beef",dozens:1,singles:1}]}, now).totalCents,3900);
  assert.deepEqual(validateOrder(valid, now).items.map(({flavor,dozens,singles})=>({flavor,dozens,singles})), valid.items);
});

test("corn is ordered separately, priced per order, and excluded from tamale counts", () => {
  const cornOnly = validateOrder({...valid,items:[{flavor:"corn",dozens:0,singles:12}]},now);
  assert.equal(cornOnly.totalTamales,0);
  assert.equal(cornOnly.totalCents,21600);
  assert.deepEqual(calculateTotal(cornOnly.items),{totalTamales:0,totalCorn:12,totalSides:12,totalItems:12,totalCents:21600});
  rejects({...valid,items:[{flavor:"corn",dozens:1,singles:1}]},"items");
  for (const singles of [-1,1.5,1001,"2",null]) rejects({...valid,items:[{flavor:"corn",dozens:0,singles}]},"items");
  assert.equal(validateOrder({...valid,items:[{flavor:"corn",dozens:0,singles:1000}]},now).totalCents,1800000);
});

test("supports custom larger dozen counts while rejecting malformed quantities", () => {
  assert.equal(validateOrder({...valid,items:[{flavor:"pork",dozens:11,singles:0}]}, now).totalTamales,132);
  for (const dozens of [-1, 0.5, 1001, "2", null]) rejects({...valid,items:[{flavor:"pork",dozens,singles:0}]}, "items");
  for (const singles of [-1, 1.5, 12, "1", null]) rejects({...valid,items:[{flavor:"pork",dozens:1,singles}]}, "items");
  rejects({...valid,items:[{flavor:"pork",dozens:0,singles:0}]}, "items");
  rejects({...valid,items:[{flavor:"pork",dozens:1,singles:0},{flavor:"pork",dozens:2,singles:0}]}, "items");
  rejects({...valid,items:[{flavor:"unknown",dozens:1,singles:0}]}, "items");
});

test("drafts allow incomplete contact details, submissions require complete contacts", () => {
  const draft = validateOrder({status:"draft",items:valid.items},now);
  assert.equal(draft.name,"Untitled order");
  for (const field of ["name","contactName","email","phone","pickupDate"]) rejects({...valid,[field]:""},field);
  rejects({...valid,email:"not-an-email"},"email");
  rejects({...valid,phone:"123"},"phone");
  rejects({...valid,phone:"312-call-now"},"phone");
  rejects({...valid,name:"x".repeat(101)},"name");
  rejects({...valid,notes:"x".repeat(2001)},"notes");
});

test("requested dates are valid calendar dates and use the Chicago day", () => {
  assert.equal(chicagoDate(new Date("2026-10-30T01:00:00Z")),"2026-10-29");
  rejects({...valid,pickupDate:"2026-02-30"},"pickupDate");
  rejects({...valid,pickupDate:"2026-10-28"},"pickupDate");
  assert.equal(validateOrder({...valid,pickupDate:"2026-10-29"},now).pickupDate,"2026-10-29");
});

test("clients cannot forge prices, roles, or kitchen statuses", () => {
  const order = validateOrder({...valid,totalCents:1,totalTamales:1,userId:"another-user",adminNote:"forged",isAdmin:true},now);
  assert.equal(order.totalCents,6750);
  assert.equal(order.totalTamales,27);
  assert.equal("userId" in order,false);
  assert.equal("adminNote" in order,false);
  rejects({...valid,status:"confirmed"},"status");
});

test("admin access is an exact, normalized allowlist match and defaults closed", () => {
  assert.equal(emailIsAdmin("Owner@Example.com","other@example.com, owner@example.com "),true);
  assert.equal(emailIsAdmin("owner@example.com.attacker.test","owner@example.com"),false);
  assert.equal(emailIsAdmin("notowner@example.com","owner@example.com"),false);
  assert.equal(emailIsAdmin("owner@example.com",""),false);
  assert.equal(emailIsAdmin(null,"owner@example.com"),false);
});

test("kitchen uses only in-progress and completed, allowing reopening", () => {
  assert.deepEqual(validateAdminUpdate({status:"completed"},"in-progress"),{status:"completed"});
  assert.deepEqual(validateAdminUpdate({status:"in-progress"},"completed"),{status:"in-progress"});
  assert.deepEqual(validateAdminUpdate({adminNote:" Call before pickup "},"in-progress"),{adminNote:"Call before pickup"});
  for (const status of ["ready","confirmed","cancelled","draft"]) assert.throws(()=>validateAdminUpdate({status},"in-progress"),{status:400});
  assert.throws(()=>validateAdminUpdate({status:"in-progress"},"draft"),{status:409});
  assert.throws(()=>validateAdminUpdate({adminNote:"x".repeat(2001)},"in-progress"),{status:400});
});

test("mutations require a matching origin and JSON, rejecting cross-site posts", () => {
  const request = (headers) => new Request("https://kitchen.example/api/orders",{method:"POST",headers});
  assert.doesNotThrow(()=>requireSameOrigin(request({origin:"https://kitchen.example","content-type":"application/json"})));
  assert.throws(()=>requireSameOrigin(request({origin:"https://attacker.example","content-type":"application/json"})),{status:403});
  assert.throws(()=>requireSameOrigin(request({"content-type":"application/json"})),{status:403});
  assert.throws(()=>requireSameOrigin(request({origin:"https://kitchen.example","content-type":"text/plain"})),{status:415});
  assert.throws(()=>requireSameOrigin(request({origin:"https://kitchen.example","content-type":"application/json","sec-fetch-site":"cross-site"})),{status:403});
});

test("idempotency keys have bounded safe syntax", () => {
  assert.equal(validateIdempotencyKey("a1234567-6789-abcd"),"a1234567-6789-abcd");
  for (const key of [undefined,"", "short", "x".repeat(101), "../../order"]) assert.throws(()=>validateIdempotencyKey(key),{status:400});
});

test("idempotent retries cannot mistake a saved draft for a submitted order", () => {
  const submitted = validateOrder(valid, now);
  const draft = validateOrder({...valid,status:"draft"}, now);
  assert.equal(matchesSavedOrder(submitted,draft),false);
  assert.equal(matchesSavedOrder(submitted,{...submitted,status:"completed"}),true);
  assert.equal(matchesSavedOrder(submitted,{...submitted,name:"Changed order"}),false);
  assert.equal(matchesSavedOrder(submitted,{...submitted,items:[{flavor:"pork",dozens:2,singles:3}]}),false);
  assert.equal(matchesSavedOrder(draft,draft),true);
  const fullEditor = {...valid,items:[...valid.items,{flavor:"retired-unselected-item",dozens:0,singles:0}]};
  const retry = validateOrder(fullEditor,now,[FLAVORS.find((item)=>item.id==="chicken")]);
  assert.equal(matchesSavedOrder(retry,submitted),true);
});

test("dynamic catalog prices and snapshots are authoritative, with separate side units", () => {
  const rice = {id:"new-rice-item",name:"Rice",description:"",kind:"side",unit:"container",dozenCents:0,singleCents:800,active:true,sortOrder:5};
  const menu = [...FLAVORS,rice];
  const order = validateOrder({...valid,items:[{flavor:rice.id,dozens:0,singles:2,name:"Forged",kind:"tamale",singleCents:1}]},now,menu);
  assert.equal(order.totalCents,1600);
  assert.equal(order.totalTamales,0);
  assert.equal(order.items[0].name,"Rice");
  assert.equal(order.items[0].kind,"side");
  assert.equal(order.items[0].unit,"container");
  assert.equal(order.items[0].singleCents,800);
  const changed = menu.map((item)=>item.id===rice.id?{...item,singleCents:1000,name:"New rice name"}:item);
  assert.equal(calculateTotal(order.items,changed).totalCents,2000);
  assert.equal(order.items[0].singleCents,800);
  assert.deepEqual(summarizeQuantities(order.items,[]),{totalTamales:0,totalCorn:0,totalSides:2,totalItems:2});
  assert.throws(()=>validateOrder({...valid,items:order.items},now,[{...rice,active:false}]),(error)=>Boolean(error.fields?.items));
  assert.equal(validateOrder({...valid,status:"draft",items:order.items},now,[{...rice,active:false}]).totalCents,1600);
});

test("reviewed price detects a price change before submission", () => {
  assert.doesNotThrow(()=>requireReviewedPrice({status:"in-progress",expectedTotalCents:3000},3000));
  assert.throws(()=>requireReviewedPrice({status:"in-progress",expectedTotalCents:3000},3600),{status:409});
  assert.throws(()=>requireReviewedPrice({status:"in-progress",expectedTotalCents:"3000"},3000),{status:409});
});

test("menu changes validate prices, units, and immutable item kinds", () => {
  const side = validateMenuItem({name:"Rice",kind:"side",unit:"tray",singleCents:1800});
  assert.equal(side.dozenCents,0);
  assert.equal(side.active,true);
  assert.throws(()=>validateMenuItem({...side,singleCents:-1}));
  assert.throws(()=>validateMenuItem({...side,singleCents:1.1}));
  assert.throws(()=>validateMenuItem({...side,singleCents:"1800"}));
  assert.throws(()=>validateMenuItem({...side,unit:"dozen"}));
  assert.throws(()=>validateMenuItem({kind:"tamale"},{...side,id:"rice"}));
  assert.equal(validateMenuItem({singleCents:2000},{...side,id:"rice"}).singleCents,2000);
});

test("account provisioning rejects invalid roles and email changes", () => {
  assert.deepEqual(validateAccount({name:" Manager ",email:"MANAGER@EXAMPLE.COM",role:"admin"}),{name:"Manager",email:"manager@example.com",role:"admin"});
  assert.throws(()=>validateAccount({name:"Manager",email:"manager@example.com",role:"owner"}));
  assert.throws(()=>validateAccount({name:"Manager",email:"not-email",role:"admin"}));
  assert.throws(()=>validateAccount({email:"new@example.com"},{name:"Manager",email:"old@example.com",role:"admin"}));
  assert.throws(()=>assertMayChangeRole("self","self","customer"),{status:409});
  assert.doesNotThrow(()=>assertMayChangeRole("self","other","customer"));
});

test("the atomic role update preserves a joined admin even when pending admins exist", () => {
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE users(id TEXT PRIMARY KEY,user_id TEXT,role TEXT NOT NULL)");
  database.prepare("INSERT INTO users VALUES (?,?,?)").run("one","identity-one","admin");
  database.prepare("INSERT INTO users VALUES (?,?,?)").run("pending",null,"admin");
  const demote = database.prepare(`UPDATE users SET role='customer' WHERE id=? AND ${KEEP_JOINED_ADMIN_SQL}`);
  assert.equal(demote.run("one").changes,0);
  database.prepare("INSERT INTO users VALUES (?,?,?)").run("two","identity-two","admin");
  assert.equal(demote.run("one").changes,1);
  assert.equal(demote.run("two").changes,0);
  assert.equal(demote.run("pending").changes,1);
  database.close();
});
