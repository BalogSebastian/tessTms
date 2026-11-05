import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GET as session } from "../app/api/session/route";
import { POST as setup } from "../app/api/auth/setup/route";
import { POST as login } from "../app/api/auth/login/route";
import { POST as logout } from "../app/api/auth/logout/route";
import { GET as workspace, PUT as saveWorkspace } from "../app/api/workspace/route";
import { POST as addUser } from "../app/api/users/route";
import { GET as download, PUT as upload } from "../app/api/files/[id]/route";
import { repository } from "../lib/server/repository";

const origin="http://localhost:3000";
function request(path: string, method="GET", body?: unknown, cookie="", requestOrigin=origin) {
  return new Request(`${origin}/api/${path}`,{method,headers:{"Content-Type":"application/json",Origin:requestOrigin,Cookie:cookie},...(body===undefined ? {} : {body:JSON.stringify(body)})});
}
const sessionCookie=(r:Response) => r.headers.get("set-cookie")!.split(";")[0];

test("HTTP route flow: first setup, protected persistence, role denial, private files and logout",async () => {
  const directory=mkdtempSync(join(tmpdir(),"tesstms-api-"));
  process.env.TMS_DATABASE_PATH=join(directory,"api.sqlite");
  try {
    assert.deepEqual(await (await session(request("session"))).json(),{user:null,needsSetup:true});
    assert.equal((await workspace(request("workspace"))).status,401);
    const created=await setup(request("auth/setup","POST",{name:"API Admin",email:"api@example.com",password:"api-password-strong-2026",workspaceName:"API ügyfél",sampleData:true}));
    assert.equal(created.status,201);
    assert.match(created.headers.get("set-cookie")!,/HttpOnly; SameSite=Lax/);
    const adminCookie=sessionCookie(created);
    const snapshot=await (await workspace(request("workspace","GET",undefined,adminCookie))).json();
    assert.equal(snapshot.state.orders.length,8);
    snapshot.state.routes.push({id:"api-route",name:"API útvonal",from:"Győr",to:"Wien",km:156,toll:4500,minutes:130});
    assert.equal((await saveWorkspace(request("workspace","PUT",{...snapshot,action:"API mentés",entity:"api-route"},adminCookie,"https://foreign.example"))).status,403);
    const saved=await saveWorkspace(request("workspace","PUT",{...snapshot,action:"API mentés",entity:"api-route"},adminCookie));
    assert.equal(saved.status,200);
    assert.equal((await saved.json()).revision,1);
    assert.equal((await saveWorkspace(request("workspace","PUT",{...snapshot,action:"Elavult mentés",entity:"api-route"},adminCookie))).status,409);
    const context={params:Promise.resolve({id:"api-file"})};
    const file=await upload(new Request(`${origin}/api/files/api-file`,{method:"PUT",headers:{Origin:origin,Cookie:adminCookie,"Content-Type":"application/pdf","X-File-Name":encodeURIComponent("Fuvarmegbízás.pdf")},body:"%PDF-1.4\nhello"}),context);
    assert.equal(file.status,201);
    const downloaded=await download(request("files/api-file","GET",undefined,adminCookie),context);
    assert.equal(downloaded.status,200);
    assert.equal(await downloaded.text(),"%PDF-1.4\nhello");
    assert.equal((await download(request("files/api-file"),context)).status,401);
    assert.equal((await addUser(request("users","POST",{name:"Megtekintő",email:"viewer@example.com",password:"viewer-password-strong-2026",role:"viewer"},adminCookie))).status,201);
    const viewerLogin=await login(request("auth/login","POST",{email:"viewer@example.com",password:"viewer-password-strong-2026"}));
    assert.equal(viewerLogin.status,200);
    const viewerCookie=sessionCookie(viewerLogin);
    const current=await (await workspace(request("workspace","GET",undefined,viewerCookie))).json();
    assert.equal((await saveWorkspace(request("workspace","PUT",{...current,action:"Tiltott mentés",entity:"viewer"},viewerCookie))).status,403);
    assert.equal((await addUser(request("users","POST",{name:"Tiltott",email:"forged@example.com",password:"forged-password-strong-2026",role:"admin"},viewerCookie))).status,403);
    const loggedOut=await logout(request("auth/logout","POST",{},adminCookie));
    assert.equal(loggedOut.status,200);
    assert.equal((await workspace(request("workspace","GET",undefined,adminCookie))).status,401);
  } finally {
    repository().close();
    rmSync(directory,{recursive:true,force:true});
  }
});
