import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateRoute, listIntegrations, testIntegration } from "../lib/server/integrations";
import type { SessionUser } from "../lib/server/repository";
import { ApiError } from "../lib/server/errors";

const user:SessionUser={id:"u1",name:"Admin",email:"admin@example.com",role:"admin",workspaceId:"customer-1",workspaceName:"Customer"};
const env={TMS_INTEGRATION_WORKSPACE_ID:"customer-1",TMS_HERE_API_KEY:"secret-here-key",TMS_GOOGLE_MAPS_API_KEY:"secret-google-key",TMS_SAP_BASE_URL:"https://sap.example.com:50000/b1s/v2",TMS_SAP_COMPANY_DB:"secret-company",TMS_SAP_USERNAME:"secret-user",TMS_SAP_PASSWORD:"secret-password",TMS_WEBHOOK_URL:"https://webhook.example.com/private"};
const route={provider:"here" as const,origin:{lat:47.4979,lng:19.0402},destination:{lat:47.6875,lng:17.6504}};
const status=(code:number) => (error:unknown) => error instanceof ApiError && error.status===code;

test("integration metadata is redacted and secrets are usable only by the bound workspace",async () => {
  const available=listIntegrations(user,env);
  assert.equal(available.find((i) => i.id==="here")?.configured,true);
  assert.equal(available.find((i) => i.id==="scanr")?.status,"contract_required");
  const encoded=JSON.stringify(available);
  assert.equal(encoded.includes("secret-here-key"),false);
  assert.equal(encoded.includes("secret-password"),false);
  assert.equal(encoded.includes("https://sap.example.com"),false);
  const other={...user,workspaceId:"customer-2"};
  assert.equal(listIntegrations(other,env).some((i) => i.configured),false);
  let fetched=false;
  const fetcher=(async () => {fetched=true;throw new Error("must not fetch");}) as typeof fetch;
  await assert.rejects(() => testIntegration(other,"here",env,fetcher),status(503));
  await assert.rejects(() => calculateRoute(other,route,env,fetcher),status(503));
  await assert.rejects(() => testIntegration({...user,role:"viewer"},"here",env,fetcher),status(403));
  assert.equal(fetched,false);
});

test("HERE routing sends a truck request and sums every route section",async () => {
  const fetcher=(async (input:RequestInfo|URL,init?:RequestInit) => {
    const url=new URL(String(input));
    assert.equal(url.origin,"https://router.hereapi.com");
    assert.equal(url.searchParams.get("transportMode"),"truck");
    assert.equal(url.searchParams.get("vehicle[grossWeight]"),"40000");
    assert.equal(url.searchParams.get("vehicle[height]"),"400");
    assert.equal(init?.redirect,"error");
    return Response.json({routes:[{sections:[{summary:{length:120000,duration:6000}},{summary:{length:35000,duration:1800}}]}]});
  }) as typeof fetch;
  const result=await calculateRoute(user,{...route,truck:{grossWeightKg:40000,heightCm:400}},env,fetcher);
  assert.equal(result.kilometers,155);
  assert.equal(result.minutes,130);
  assert.equal(result.truckRestrictionsApplied,true);
  assert.equal(JSON.stringify(result).includes("secret-here-key"),false);
});

test("Google routes use restricted field mask and cannot silently ignore truck constraints",async () => {
  let calls=0;
  const fetcher=(async (_input:RequestInfo|URL,init?:RequestInit) => {
    calls++;
    const headers=init?.headers as Record<string,string>;
    assert.equal(headers["X-Goog-FieldMask"],"routes.distanceMeters,routes.duration");
    assert.equal(headers["X-Goog-Api-Key"],env.TMS_GOOGLE_MAPS_API_KEY);
    assert.equal(JSON.parse(String(init?.body)).travelMode,"DRIVE");
    return Response.json({routes:[{distanceMeters:123450,duration:"5400s"}]});
  }) as typeof fetch;
  const result=await calculateRoute(user,{...route,provider:"google"},env,fetcher);
  assert.equal(result.kilometers,123.5);
  assert.equal(result.minutes,90);
  assert.equal(result.truckRestrictionsApplied,false);
  await assert.rejects(() => calculateRoute(user,{...route,provider:"google",truck:{heightCm:400}},env,fetcher),status(422));
  assert.equal(calls,1);
});

test("SAP connectivity logs in, reads metadata and always logs out without ERP business writes",async () => {
  const calls:{url:string;method:string}[]=[];
  const fetcher=(async (input:RequestInfo|URL,init?:RequestInit) => {
    const url=String(input);calls.push({url,method:init?.method || "GET"});
    if(url.endsWith("/Login")) {
      assert.equal(JSON.parse(String(init?.body)).CompanyDB,env.TMS_SAP_COMPANY_DB);
      return Response.json({SessionId:"session-id"},{headers:{"Set-Cookie":"B1SESSION=session-id; HttpOnly"}});
    }
    assert.match((init?.headers as Record<string,string>).Cookie,/B1SESSION=session-id/);
    if(url.endsWith("/$metadata")) return new Response("<edmx:Edmx />");
    return new Response(null,{status:204});
  }) as typeof fetch;
  const result=await testIntegration(user,"sap",env,fetcher);
  assert.equal(result.ok,true);
  assert.deepEqual(calls.map((c) => [c.url.split("/").at(-1),c.method]),[["Login","POST"],["$metadata","GET"],["Logout","POST"]]);
  assert.equal(JSON.stringify(result).includes("secret-password"),false);
});

test("webhook testing sends HEAD only, provider failures never echo secret bodies",async () => {
  const fetcher=(async (_input:RequestInfo|URL,init?:RequestInit) => {assert.equal(init?.method,"HEAD");return new Response(null,{status:200});}) as typeof fetch;
  assert.equal((await testIntegration(user,"webhook",env,fetcher)).ok,true);
  const failure=(async () => new Response("secret-here-key echoed by provider",{status:401})) as typeof fetch;
  await assert.rejects(() => calculateRoute(user,route,env,failure),(error:unknown) => error instanceof ApiError && error.status===502 && !error.message.includes("secret-here-key"));
  const invalid=(async () => new Response("secret-here-key invalid json")) as typeof fetch;
  await assert.rejects(() => calculateRoute(user,route,env,invalid),(error:unknown) => error instanceof ApiError && error.status===502 && !error.message.includes("secret-here-key"));
  assert.equal(listIntegrations(user,{...env,TMS_SAP_BASE_URL:"http://insecure.example.com/b1s/v2"}).find((i) => i.id==="sap")?.configured,false);
});
