import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmsRepository, hashPassword, verifyPassword } from "../lib/server/repository";
import { ApiError } from "../lib/server/errors";
import { sameOrigin } from "../lib/server/http";

const setup = {name:"Teszt Admin",email:"admin@example.com",password:"test-password-strong-2026",workspaceName:"Első ügyfél",sampleData:true};
const status = (code: number) => (error: unknown) => error instanceof ApiError && error.status===code;
function fixture() {
  const directory = mkdtempSync(join(tmpdir(),"tesstms-server-"));
  const path = join(directory,"test.sqlite");
  const repo = new TmsRepository(path);
  const user = repo.createWorkspace(setup,true);
  return {repo,user,path,cleanup:() => {repo.close();rmSync(directory,{recursive:true,force:true});}};
}

test("passwords are salted, verified, and sessions are stored as hashes",() => {
  const first=hashPassword(setup.password), second=hashPassword(setup.password);
  assert.notEqual(first,second);
  assert.ok(verifyPassword(setup.password,first));
  assert.equal(verifyPassword("wrong",first),false);
  const {repo,user,cleanup}=fixture();
  try {
    const token=repo.createSession(user);
    assert.equal(repo.session(token)?.email,setup.email);
    assert.equal(repo.session("forged-token"),null);
    const row=repo.db.prepare("SELECT token_hash FROM sessions").get();
    assert.ok(row && row.token_hash !== token);
    repo.logout(token);
    assert.equal(repo.session(token),null);
    assert.throws(() => repo.createWorkspace({...setup,email:"other@example.com"},true),status(409));
  } finally {cleanup();}
});

test("workspaces, private files, and audit events remain isolated",() => {
  const {repo,user,cleanup}=fixture();
  try {
    const other=repo.createWorkspace({...setup,email:"second@example.com",workspaceName:"Másik ügyfél",sampleData:false});
    assert.equal(repo.readWorkspace(other).state.orders.length,0);
    const snapshot=repo.readWorkspace(user);
    snapshot.state.routes.push({id:"private-route",name:"Belső",from:"A",to:"B",km:10,toll:0,minutes:30});
    repo.saveWorkspace(user,{...snapshot,action:"Útvonal mentve",entity:"private-route"});
    assert.equal(repo.readWorkspace(other).state.routes.length,0);
    repo.putFile(user,"secret-file","CMR.pdf","application/pdf",new TextEncoder().encode("%PDF-1.4\nprivate"));
    assert.equal(repo.getFile(user,"secret-file").name,"CMR.pdf");
    assert.throws(() => repo.getFile(other,"secret-file"),status(404));
    assert.equal(repo.audit(other).some((a) => a.entity==="private-route"),false);
    assert.throws(() => repo.db.prepare("DELETE FROM audit_events").run(),/append-only/);
    assert.throws(() => repo.db.prepare("UPDATE audit_events SET actor='forged'").run(),/append-only/);
  } finally {cleanup();}
});

test("revision conflict prevents silent overwrites and survives reopening",() => {
  const {repo,user,path,cleanup}=fixture();
  try {
    const first=repo.readWorkspace(user),stale=repo.readWorkspace(user);
    first.state.routes.push({id:"first-route",name:"Első",from:"A",to:"B",km:10,toll:0,minutes:30});
    const saved=repo.saveWorkspace(user,{...first,action:"Mentés",entity:"route"});
    assert.equal(saved.revision,1);
    assert.throws(() => repo.saveWorkspace(user,{...stale,action:"Másik mentés",entity:"route"}),status(409));
    const another=new TmsRepository(path);
    try {assert.equal(another.readWorkspace(user).state.routes[0].id,"r1");assert.ok(another.readWorkspace(user).state.routes.some((r) => r.id==="first-route"));} finally {another.close();}
  } finally {cleanup();}
});

test("server rejects unauthorized changes, fake CMR, and impossible workflow",() => {
  const {repo,user,cleanup}=fixture();
  try {
    const viewer={...user,role:"viewer" as const};
    const snap=repo.readWorkspace(user);
    assert.throws(() => repo.saveWorkspace(viewer,{...snap,action:"Mentés",entity:"Teszt"}),status(403));
    const dispatcher={...user,role:"dispatcher" as const};
    const credit=repo.readWorkspace(user);credit.state.partners[0].credit+=1;
    assert.throws(() => repo.saveWorkspace(dispatcher,{...credit,action:"Hitelkeret",entity:"p1"}),status(403));
    const fake=repo.readWorkspace(user);fake.state.documents.push({id:"fake",name:"fake.pdf",orderId:fake.state.orders[0].id,type:"CMR",createdAt:new Date().toISOString(),version:1,blobId:"does-not-exist"});
    assert.throws(() => repo.saveWorkspace(user,{...fake,action:"CMR",entity:"fake"}),status(422));
    const jump=repo.readWorkspace(user);jump.state.orders.find((o) => o.status==="Új")!.status="Lezárva";
    assert.throws(() => repo.saveWorkspace(user,{...jump,action:"Státusz",entity:"jump"}),status(422));
    assert.equal(repo.readWorkspace(user).revision,0);
  } finally {cleanup();}
});

test("strict schemas prevent malformed quantities and unknown fields",() => {
  const {repo,user,cleanup}=fixture();
  try {
    const snap=repo.readWorkspace(user);snap.state.stock[0].quantity=-10;
    assert.throws(() => repo.saveWorkspace(user,{...snap,action:"Készlet",entity:"negative"}));
    const extra={...repo.readWorkspace(user),action:"Mentés",entity:"X",workspaceId:"forged"};
    assert.throws(() => repo.saveWorkspace(user,extra));
    assert.throws(() => repo.putFile(user,"bad","test.html","text/html",new Uint8Array([1])),status(415));
    assert.throws(() => repo.putFile(user,"../bad","test.pdf","application/pdf",new Uint8Array([1])),status(400));
  } finally {cleanup();}
});

test("credit reservation is validated against the entire transaction, not each isolated row",() => {
  const {repo,user,cleanup}=fixture();
  try {
    const snap=repo.readWorkspace(user);
    const template=structuredClone(snap.state.orders.find((o) => o.status==="Új")!);
    snap.state.orders.push({...template,id:"new-a",reference:"NEW-A",partnerId:"p1",price:4000000,currency:"HUF",vehicleId:"",driverId:"",status:"Új"});
    snap.state.orders.push({...template,id:"new-b",reference:"NEW-B",partnerId:"p1",price:4000000,currency:"HUF",vehicleId:"",driverId:"",status:"Új"});
    assert.throws(() => repo.saveWorkspace(user,{...snap,action:"Két új fuvar",entity:"credit"}),status(422));
    assert.equal(repo.readWorkspace(user).revision,0);
    assert.equal(repo.readWorkspace(user).state.orders.some((o) => o.id==="new-a"),false);
  } finally {cleanup();}
});

test("failed logins are rate limited and same-origin mutations reject foreign origins",() => {
  const {repo,cleanup}=fixture();
  try {
    for(let i=0;i<8;i++) assert.throws(() => repo.login(setup.email,"wrong"),status(401));
    assert.throws(() => repo.login(setup.email,setup.password),status(429));
    assert.doesNotThrow(() => sameOrigin(new Request("http://localhost:3000/api/workspace",{headers:{origin:"http://localhost:3000"}})));
    assert.throws(() => sameOrigin(new Request("http://localhost:3000/api/workspace",{headers:{origin:"https://evil.example"}})),status(403));
    assert.throws(() => sameOrigin(new Request("http://localhost:3000/api/workspace")),status(403));
  } finally {cleanup();}
});
