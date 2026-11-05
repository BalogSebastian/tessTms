import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmsRepository, repository, type SessionUser } from "../lib/server/repository";
import { ApiError } from "../lib/server/errors";
import { POST as changePassword } from "../app/api/auth/password/route";
import { PATCH as updateUser } from "../app/api/users/[id]/route";

const setup={name:"Security Admin",email:"security@example.com",password:"security-password-strong-2026",workspaceName:"Security ügyfél",sampleData:false};
const status=(code:number) => (error:unknown) => error instanceof ApiError && error.status===code;
function fixture() {
  const repo=new TmsRepository(":memory:");
  const admin=repo.createWorkspace(setup,true);
  return {repo,admin};
}

test("the last active administrator cannot disable or demote themselves",() => {
  const {repo,admin}=fixture();
  try {
    const token=repo.createSession(admin);
    assert.throws(() => repo.updateUser(admin,admin.id,{active:false}),status(409));
    assert.throws(() => repo.updateUser(admin,admin.id,{role:"dispatcher"}),status(409));
    assert.equal(repo.session(token)?.role,"admin");
    assert.equal(repo.users(admin)[0].active,1);
  } finally {repo.close();}
});

test("user administration is tenant scoped and role changes revoke prior sessions",() => {
  const {repo,admin}=fixture();
  try {
    const target=repo.addUser(admin,{name:"Fuvarszervező",email:"dispatch@example.com",password:"dispatcher-password-strong-2026",role:"dispatcher"});
    const dispatcher=repo.login(target.email,"dispatcher-password-strong-2026");
    const token=repo.createSession(dispatcher);
    const other=repo.createWorkspace({...setup,email:"other-admin@example.com",workspaceName:"Másik ügyfél"});
    assert.throws(() => repo.updateUser(admin,other.id,{active:false}),status(404));
    assert.throws(() => repo.updateUser(other,target.id,{role:"admin"}),status(404));
    assert.throws(() => repo.updateUser(dispatcher,admin.id,{active:false}),status(403));
    const updated=repo.updateUser(admin,target.id,{role:"viewer"});
    assert.equal(updated.role,"viewer");
    assert.equal(updated.active,1);
    assert.equal(repo.session(token),null);
    assert.equal(repo.login(target.email,"dispatcher-password-strong-2026").role,"viewer");
  } finally {repo.close();}
});

test("deactivation blocks login, revokes every session and reactivation does not restore tokens",() => {
  const {repo,admin}=fixture();
  try {
    const target=repo.addUser(admin,{name:"Második admin",email:"second-admin@example.com",password:"second-admin-password-strong-2026",role:"admin"});
    const second=repo.login(target.email,"second-admin-password-strong-2026");
    const first=repo.createSession(admin),another=repo.createSession(admin);
    assert.equal(repo.updateUser(second,admin.id,{active:false}).active,0);
    assert.equal(repo.session(first),null);assert.equal(repo.session(another),null);
    assert.throws(() => repo.login(admin.email,setup.password),status(401));
    assert.equal(repo.updateUser(second,admin.id,{active:true}).active,1);
    assert.equal(repo.session(first),null);
    assert.equal(repo.login(admin.email,setup.password).id,admin.id);
    repo.updateUser(admin,second.id,{active:false});
    assert.throws(() => repo.updateUser(admin,admin.id,{active:false}),status(409));
  } finally {repo.close();}
});

test("password changes verify the old password, replace its hash and revoke every old session",() => {
  const {repo,admin}=fixture();
  try {
    const token=repo.createSession(admin),another=repo.createSession(admin);
    assert.throws(() => repo.changePassword(admin,{currentPassword:"wrong",newPassword:"new-password-strong-2026"}),status(401));
    assert.equal(repo.session(token)?.id,admin.id);
    repo.changePassword(admin,{currentPassword:setup.password,newPassword:"new-password-strong-2026"});
    assert.equal(repo.session(token),null);assert.equal(repo.session(another),null);
    assert.throws(() => repo.login(admin.email,setup.password),status(401));
    assert.equal(repo.login(admin.email,"new-password-strong-2026").id,admin.id);
    assert.equal(repo.audit(admin).some((e) => e.action==="Jelszó megváltoztatva"),true);
    assert.equal(JSON.stringify(repo.audit(admin)).includes("new-password-strong-2026"),false);
  } finally {repo.close();}
});

test("opening stock must have a matching ledger entry and vehicle plates are unique after normalization",() => {
  const {repo,admin}=fixture();
  try {
    const invalid=repo.readWorkspace(admin);
    invalid.state.stock.push({id:"stock-new",name:"Motorolaj",companyId:"main",depot:"Győr",quantity:50,minimum:10,unit:"liter",price:3200});
    assert.throws(() => repo.saveWorkspace(admin,{...invalid,action:"Nyitókészlet",entity:"stock-new"}),status(422));
    invalid.state.stockMoves.push({id:"opening",stockId:"stock-new",quantity:50,recipient:"Nyitóleltár",createdAt:new Date().toISOString()});
    const saved=repo.saveWorkspace(admin,{...invalid,action:"Nyitókészlet",entity:"stock-new"});
    assert.equal(saved.state.stock[0].quantity,50);
    assert.equal(saved.state.stockMoves[0].quantity,50);
    saved.state.drivers.push({id:"driver-new",name:"Sofőr",companyId:"main",phone:"+3612345678",drivingMinutes:400,adr:false});
    const vehicle={id:"vehicle-new",plate:"ABC-123",model:"Vontató",companyId:"main" as const,driverId:"driver-new",trailer:"TP-123",capacity:24000,adr:false,lastCity:"Győr",lat:47.68,lng:17.65,km:120000,serviceAt:150000,inspection:"2027-11-05"};
    saved.state.vehicles.push(vehicle,{...vehicle,id:"duplicate",plate:"abc 123"});
    assert.throws(() => repo.saveWorkspace(admin,{...saved,action:"Jármű",entity:"duplicate"}),status(422));
    assert.equal(repo.readWorkspace(admin).state.vehicles.length,0);
  } finally {repo.close();}
});

test("approved purchases cannot be rewritten or deleted while normal status progression remains valid",() => {
  const repo=new TmsRepository(":memory:");
  try {
    const admin=repo.createWorkspace({...setup,sampleData:true},true);
    let snapshot=repo.readWorkspace(admin);
    const purchaseId=snapshot.state.purchases[0].id;
    snapshot.state.purchases[0].status="Jóváhagyva";
    repo.saveWorkspace(admin,{...snapshot,action:"Jóváhagyás",entity:purchaseId});
    const dispatcher={...admin,role:"dispatcher" as const};
    snapshot=repo.readWorkspace(admin);
    snapshot.state.purchases.find((purchase) => purchase.id===purchaseId)!.amount=999999999;
    assert.throws(() => repo.saveWorkspace(dispatcher,{...snapshot,action:"Összeg átírása",entity:purchaseId}),status(422));
    snapshot=repo.readWorkspace(admin);
    snapshot.state.purchases=snapshot.state.purchases.filter((purchase) => purchase.id!==purchaseId);
    assert.throws(() => repo.saveWorkspace(admin,{...snapshot,action:"Törlés",entity:purchaseId}),status(422));
    snapshot=repo.readWorkspace(admin);
    snapshot.state.purchases.find((purchase) => purchase.id===purchaseId)!.status="Megrendelve";
    const progressed=repo.saveWorkspace(dispatcher,{...snapshot,action:"Megrendelés",entity:purchaseId});
    assert.equal(progressed.state.purchases.find((purchase) => purchase.id===purchaseId)!.status,"Megrendelve");
    assert.equal(progressed.state.purchases.find((purchase) => purchase.id===purchaseId)!.amount,128000);
  } finally {repo.close();}
});

test("unchanged orders retain valid vehicle and driver references in every saved snapshot",() => {
  const repo=new TmsRepository(":memory:");
  try {
    const admin=repo.createWorkspace({...setup,sampleData:true},true);
    let snapshot=repo.readWorkspace(admin);
    snapshot.state.vehicles=snapshot.state.vehicles.filter((vehicle) => vehicle.id!=="v1");
    assert.throws(() => repo.saveWorkspace({...admin,role:"dispatcher"},{...snapshot,action:"Jármű törlés",entity:"v1"}),status(422));
    assert.equal(repo.readWorkspace(admin).revision,0);
    snapshot=repo.readWorkspace(admin);
    snapshot.state.orders.find((order) => order.id==="order-3")!.status="Dokumentáció";
    repo.saveWorkspace(admin,{...snapshot,action:"Lerakodás kész",entity:"order-3"});
    snapshot=repo.readWorkspace(admin);
    snapshot.state.vehicles.find((vehicle) => vehicle.id==="v3")!.driverId="d4";
    repo.saveWorkspace(admin,{...snapshot,action:"Új sofőr a járművön",entity:"v3"});
    snapshot=repo.readWorkspace(admin);
    snapshot.state.drivers=snapshot.state.drivers.filter((driver) => driver.id!=="d3");
    assert.throws(() => repo.saveWorkspace({...admin,role:"dispatcher"},{...snapshot,action:"Korábbi sofőr törlése",entity:"d3"}),(error:unknown) => error instanceof ApiError && error.status===422 && error.message.includes("sofőr"));
    assert.equal(repo.readWorkspace(admin).revision,2);
    assert.ok(repo.readWorkspace(admin).state.vehicles.some((vehicle) => vehicle.id==="v1"));
  } finally {repo.close();}
});

test("password HTTP route rotates its own cookie and user PATCH enforces authorization",async () => {
  const directory=mkdtempSync(join(tmpdir(),"tesstms-security-api-"));
  process.env.TMS_DATABASE_PATH=join(directory,"security.sqlite");
  const origin="http://localhost:3000";
  function request(path:string,method:string,data:unknown,cookie:string) {return new Request(`${origin}/api/${path}`,{method,headers:{Origin:origin,Cookie:cookie,"Content-Type":"application/json"},body:JSON.stringify(data)});}
  try {
    const repo=repository();const admin=repo.createWorkspace(setup,true);
    const oldToken=repo.createSession(admin),oldCookie=`tess_session=${oldToken}`;
    const response=await changePassword(request("auth/password","POST",{currentPassword:setup.password,newPassword:"new-api-password-strong-2026"},oldCookie));
    assert.equal(response.status,200);
    const result=await response.json() as {user:SessionUser};
    assert.equal(result.user.id,admin.id);
    assert.equal(JSON.stringify(result).includes("password"),false);
    assert.equal(repo.session(oldToken),null);
    const newCookie=response.headers.get("set-cookie")!.split(";")[0];
    const newToken=newCookie.slice("tess_session=".length);
    assert.equal(repo.session(newToken)?.id,admin.id);
    const context={params:Promise.resolve({id:admin.id})};
    assert.equal((await updateUser(request(`users/${admin.id}`,"PATCH",{active:false},oldCookie),context)).status,401);
    assert.equal((await updateUser(request(`users/${admin.id}`,"PATCH",{role:"viewer"},newCookie),context)).status,409);
  } finally {repository().close();rmSync(directory,{recursive:true,force:true});}
});
