import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = 'http://127.0.0.1:5173';
const cookie = '__sites_local_auth=1';
const pass = [];
async function request(path, {method='GET', body, auth=true, origin=base}={}) {
  const headers={}; if(auth) headers.Cookie=cookie;
  if(body!==undefined){headers['Content-Type']='application/json';headers.Origin=origin;}
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const raw=await r.text(); let data; try{data=JSON.parse(raw)}catch{data={error:raw}} return {status:r.status,data};
}
async function expect(label,path,options,status) {
  const result=await request(path,options);
  assert.equal(result.status,status,`${label}: ${JSON.stringify(result.data)}`);
  pass.push(label); return result.data;
}
let sideId; let qaAccountId;
const runId=Date.now();
try {
  await expect('Anonymous account has no identity','/api/me',{auth:false},200).then(d=>assert.equal(d.user,null));
  for(const path of ['/api/orders','/api/admin/orders','/api/admin/menu','/api/admin/users']) await expect(`Anonymous read denied ${path}`,path,{auth:false},401);
  for(const path of ['/api/orders','/api/admin/menu','/api/admin/users']) await expect(`Anonymous write denied ${path}`,path,{method:'POST',auth:false,body:{}},401);
  const me=await expect('Local admin identity recognized','/api/me',{},200);assert.equal(me.isAdmin,true);
  const before=await request('/api/orders');
  const preserved = before.data.orders.filter(o=>!o.name.startsWith('QA ')).map(o=>({id:o.id,updatedAt:o.updatedAt,status:o.status}));
  await expect('Cross-origin order write blocked','/api/orders',{method:'POST',origin:'https://example.com',body:{}},403);
  await expect('Cross-origin admin write blocked','/api/admin/menu',{method:'POST',origin:'https://example.com',body:{}},403);
  const catalog=await expect('Dynamic catalog available','/api/catalog',{},200);
  const menu=catalog.items;
  assert.ok(Array.isArray(menu));
  const tamale=menu.find(i=>i.kind==='tamale'&&i.active);
  assert.ok(tamale,'Active tamale is available');
  const created=await expect('Admin adds side with price and unit','/api/admin/menu',{method:'POST',body:{name:`QA Rice ${runId}`,description:'QA integration test side',kind:'side',unit:'container',singleCents:425,dozenCents:0,active:true,sortOrder:99999}},201);
  sideId=created.item.id;assert.equal(created.item.unit,'container');assert.equal(created.item.singleCents,425);
  const activeCatalog=await request('/api/catalog');assert.ok(activeCatalog.data.items.some(i=>i.id===sideId));pass.push('New side is available in customer catalog');
  const initialTotal=tamale.dozenCents+3*tamale.singleCents+2*425;
  const contact={name:`QA Mixed order ${runId}`,contactName:'QA Test Customer',email:'qa.customer@example.com',phone:'5551234567',pickupDate:'2099-12-31',notes:'QA local integration check only'};
  const body={...contact,items:[{flavor:tamale.id,dozens:1,singles:3},{flavor:sideId,dozens:0,singles:2}],status:'draft',idempotencyKey:randomUUID()};
  const saved=await expect('Mixed tamale and side draft saved','/api/orders',{method:'POST',body},201);
  assert.equal(saved.order.totalCents,initialTotal);assert.equal(saved.order.totalTamales,15);assert.equal(saved.order.totalSides,2);assert.equal(saved.order.totalItems,17);
  const snap=saved.order.items.find(i=>i.flavor===sideId);assert.equal(snap.name,created.item.name);assert.equal(snap.unit,'container');assert.equal(snap.singleCents,425);pass.push('Mixed total, counts and item snapshots are correct');
  const repeated=await expect('Idempotent draft retry does not duplicate','/api/orders',{method:'POST',body},200);assert.equal(repeated.order.id,saved.order.id);
  await expect('Submission requires contact details','/api/orders',{method:'POST',body:{items:body.items,status:'in-progress',idempotencyKey:randomUUID()}},400);
  const submitted=await expect('Owner submits draft to In progress',`/api/orders/${saved.order.id}`,{method:'PATCH',body:{...body,status:'in-progress',expectedTotalCents:initialTotal}},200);assert.equal(submitted.order.status,'in-progress');
  await expect('Customer cannot self-complete order',`/api/orders/${saved.order.id}`,{method:'PATCH',body:{...body,status:'completed'}},409);
  await expect('Admin updates side price','/api/admin/menu/'+sideId,{method:'PATCH',body:{singleCents:575}},200);
  const history=await request('/api/orders');const original=history.data.orders.find(o=>o.id===saved.order.id);
  assert.equal(original.totalCents,initialTotal);assert.equal(original.items.find(i=>i.flavor===sideId).singleCents,425);pass.push('Existing order retains price snapshot after menu edit');
  const afterTotal=tamale.dozenCents+3*tamale.singleCents+2*575;
  const newBody={...body,name:`QA Updated rate ${runId}`,status:'in-progress',idempotencyKey:randomUUID(),expectedTotalCents:initialTotal};
  await expect('Stale reviewed price returns 409','/api/orders',{method:'POST',body:newBody},409);
  const updatedOrder=await expect('New order uses updated rate','/api/orders',{method:'POST',body:{...newBody,expectedTotalCents:afterTotal}},201);assert.equal(updatedOrder.order.totalCents,afterTotal);assert.equal(updatedOrder.order.items.find(i=>i.flavor===sideId).singleCents,575);
  const complete=await expect('Admin marks order Completed',`/api/admin/orders/${saved.order.id}`,{method:'PATCH',body:{status:'completed',adminNote:'QA complete check'}},200);assert.equal(complete.order.status,'completed');
  const reopen=await expect('Admin reopens order to In progress',`/api/admin/orders/${saved.order.id}`,{method:'PATCH',body:{status:'in-progress'}},200);assert.equal(reopen.order.status,'in-progress');
  await expect('Unsupported legacy status rejected',`/api/admin/orders/${saved.order.id}`,{method:'PATCH',body:{status:'preparing'}},400);
  const account=await expect('Admin adds customer account','/api/admin/users',{method:'POST',body:{name:`QA Account ${runId}`,email:`qa.${runId}@example.com`,role:'customer'}},201);qaAccountId=account.user.id;assert.equal(account.user.joined,false);
  const accounts=await expect('Admin can view accounts','/api/admin/users',{},200);assert.ok(accounts.users.some(u=>u.id===qaAccountId));
  const grant=await expect('Admin grants admin role','/api/admin/users/'+qaAccountId,{method:'PATCH',body:{role:'admin'}},200);assert.equal(grant.user.role,'admin');
  const revoke=await expect('Admin revokes pending account admin role','/api/admin/users/'+qaAccountId,{method:'PATCH',body:{role:'customer'}},200);assert.equal(revoke.user.role,'customer');
  await expect('Self-demotion blocked','/api/admin/users/'+me.user.accountId,{method:'PATCH',body:{role:'customer'}},409);
  await expect('Admin deactivates test side','/api/admin/menu/'+sideId,{method:'PATCH',body:{active:false}},200);
  const withoutSide=await request('/api/catalog');assert.ok(!withoutSide.data.items.some(i=>i.id===sideId));pass.push('Deactivated side removed from customer catalog');
  await expect('Inactive side cannot be submitted','/api/orders',{method:'POST',body:{...newBody,expectedTotalCents:afterTotal,idempotencyKey:randomUUID()}},400);
  const after=await request('/api/orders');
  for(const p of preserved){const a=after.data.orders.find(o=>o.id===p.id);assert.ok(a);assert.equal(a.updatedAt,p.updatedAt);assert.equal(a.status,p.status);}pass.push(`Preserved ${preserved.length} pre-existing non-QA orders and drafts`);
  console.log(JSON.stringify({passed:pass.length,checks:pass,qaSideId:sideId,qaAccountId},null,2));
} finally {
  if(sideId)await request('/api/admin/menu/'+sideId,{method:'PATCH',body:{active:false}});
  if(qaAccountId)await request('/api/admin/users/'+qaAccountId,{method:'PATCH',body:{role:'customer'}});
}


