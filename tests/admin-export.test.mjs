import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import path from "node:path";
import ts from "typescript";

const buildDirectory=path.resolve("work/admin-tests");
await mkdir(buildDirectory,{recursive:true});
for(const [sourcePath,name] of [["app/lib/catalog.ts","catalog"],["app/orders/order-display.ts","order-display"],["app/admin/order-export.ts","order-export"]]){
  const source=await readFile(sourcePath,"utf8");
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  await writeFile(path.join(buildDirectory,`${name}.mjs`),compiled.replaceAll('"../lib/catalog"','"./catalog.mjs"').replaceAll('"../orders/order-display"','"./order-display.mjs"'));
}
const {csvCell,ordersCsv}=await import(pathToFileURL(path.join(buildDirectory,"order-export.mjs")));
const {itemDetails,itemQuantityLabel,orderQuantityLabel}=await import(pathToFileURL(path.join(buildDirectory,"order-display.mjs")));

test("CSV neutralizes spreadsheet formulas, including whitespace-prefixed formulas",()=>{
  for(const value of ["=1+1","+SUM(A1)","-cmd","@lookup","  =HYPERLINK(1)","\t=cmd","\rhello"]){assert.equal(csvCell(value),`"'${value.replaceAll('"','""')}"`);}
  assert.equal(csvCell('normal "quoted", name'),'"normal ""quoted"", name"');
  assert.equal(csvCell(null),'""');
});

test("dynamic sides keep their saved names, quantities and units",()=>{
  const side={flavor:"custom-rice",dozens:0,singles:2,name:"Rice",kind:"side",unit:"tray",singleCents:1200,dozenCents:0};
  assert.equal(itemDetails(side).name,"Rice");
  assert.equal(itemQuantityLabel(side),"2 trays");
  assert.equal(orderQuantityLabel({totalTamales:12,items:[side]}),"12 tamales + 2 Rice trays");
});

test("exports preserve saved prices instead of repricing from the menu",()=>{
  const item={flavor:"chicken",dozens:1,singles:2,name:"Original chicken",kind:"tamale",unit:"tamale",dozenCents:1800,singleCents:150};
  const csv=ordersCsv([{number:"TM-TEST",name:" =formula",status:"completed",submittedAt:"2026-10-29",pickupDate:"2026-10-30",contactName:"Example",email:"customer@example.com",phone:"+15555550123",items:[item],totalTamales:14,totalCents:2100,notes:'A note, with "quotes"',adminNote:""}]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"Original chicken"'));
  assert.ok(csv.includes('"18.00","1.50","21.00","21.00"'));
  assert.ok(csv.includes('"\' =formula"'));
  assert.ok(csv.includes('"\'+15555550123"'));
});
