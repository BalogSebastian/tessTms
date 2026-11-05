import { z } from "zod";
import { ApiError } from "./errors";
import type { SessionUser } from "./repository";

type Environment = Record<string,string|undefined>;
type Fetch = typeof fetch;
export const integrationId = z.enum(["here","google","scanr","sap","transporeon","project44","smtp","webhook"]);
export type IntegrationId = z.infer<typeof integrationId>;
type Definition = {id:IntegrationId;name:string;category:string;description:string;requiredEnv:string[];capability:string;implemented:boolean};
const definitions:Definition[] = [
  {id:"here",name:"HERE Routing",category:"Útvonaltervezés",description:"Tehergépjárműves távolság- és menetidő-számítás a HERE Routing API v8 szolgáltatásával.",requiredEnv:["TMS_HERE_API_KEY"],capability:"Valódi útvonalszámítás; a jármű méret- és tömegadatait külön kell megadni. Nincs tachográf- vagy ADR-megfelelőségi tanúsítás.",implemented:true},
  {id:"google",name:"Google Maps Routes",category:"Útvonaltervezés",description:"Közúti távolság és menetidő a Google Routes API szolgáltatásával.",requiredEnv:["TMS_GOOGLE_MAPS_API_KEY"],capability:"DRIVE útvonal; teherautó-méretkorlátozásokat nem ellenőriz.",implemented:true},
  {id:"scanr",name:"Tesotter scanR",category:"Dokumentumfeldolgozás",description:"A saját scanR szolgáltatás illesztése hitelesített API-szerződés alapján.",requiredEnv:["TMS_SCANR_BASE_URL","TMS_SCANR_API_KEY"],capability:"A scanR végpont- és válaszsémáját a szolgáltatás tulajdonosával szükséges egyeztetni. Automatikus OCR nincs bekapcsolva.",implemented:false},
  {id:"sap",name:"SAP Business One",category:"Vállalatirányítás",description:"Service Layer belépés, metaadat-ellenőrzés és kijelentkezés.",requiredEnv:["TMS_SAP_BASE_URL","TMS_SAP_COMPANY_DB","TMS_SAP_USERNAME","TMS_SAP_PASSWORD"],capability:"Olvasási kapcsolatteszt; pénzügyi feladás csak NTT DATA-val egyeztetett adatmapping és jóváhagyás után implementálható.",implemented:true},
  {id:"transporeon",name:"Transporeon",category:"Partnerkapcsolatok",description:"Megrendelés- és státuszintegráció partneri API-hozzáféréssel.",requiredEnv:[],capability:"Partneri szerződés, jogosultságok és hiteles API-specifikáció szükséges. Nincs aktív adatforgalom.",implemented:false},
  {id:"project44",name:"project44",category:"Telematika",description:"Járműkövetés és láthatósági adatok partneri kapcsolaton keresztül.",requiredEnv:[],capability:"Ügyfélspecifikus API-hozzáférés és azonosító-mapping szükséges. Nincs élő GPS-adat.",implemented:false},
  {id:"smtp",name:"E-mail / SMTP",category:"Kommunikáció",description:"Visszaigazolások és értesítések vállalati levelezésen keresztül.",requiredEnv:[],capability:"Levelezési szolgáltató és küldési adapter szükséges. A rendszer jelenleg nem küld e-mailt.",implemented:false},
  {id:"webhook",name:"Egyedi webhook",category:"Rendszerkapcsolat",description:"Ügyfélspecifikus HTTPS végpont elérhetőségének ellenőrzése.",requiredEnv:["TMS_WEBHOOK_URL"],capability:"HEAD kapcsolatteszt; eseményküldés, aláírás és újrapróbálás nincs aktiválva.",implemented:true},
];
export function integrationScope(user: SessionUser, env:Environment=process.env) {
  return env.TMS_INTEGRATION_WORKSPACE_ID === user.workspaceId;
}
function validUrl(value:string|undefined) {
  if (!value) return false;
  try {const url=new URL(value);return url.protocol === "https:" && !url.username && !url.password;} catch {return false;}
}
export function listIntegrations(user:SessionUser,env:Environment=process.env) {
  const scoped=integrationScope(user,env);
  return definitions.map(({implemented,...definition}) => {
    let configured=implemented && scoped && definition.requiredEnv.every((key) => Boolean(env[key]?.trim()));
    if (definition.id === "sap") configured=configured && validUrl(env.TMS_SAP_BASE_URL);
    if (definition.id === "webhook") configured=configured && validUrl(env.TMS_WEBHOOK_URL);
    return {...definition,requiredEnv:["TMS_INTEGRATION_WORKSPACE_ID",...definition.requiredEnv],configured,status:!implemented ? "contract_required" as const : configured ? "configured" as const : "not_configured" as const};
  });
}
function assertConfigured(user:SessionUser,id:IntegrationId,env:Environment) {
  const integration=listIntegrations(user,env).find((i) => i.id===id)!;
  if (!integration.configured) throw new ApiError(503,integration.status === "contract_required" ? "Ehhez a kapcsolathoz szolgáltatói szerződés és egyedi illesztés szükséges." : "A szolgáltatás nincs beállítva ehhez a munkatérhez.");
}
async function call(fetcher:Fetch,url:string|URL,init:RequestInit={}) {
  try {return await fetcher(url,{...init,signal:AbortSignal.timeout(12000),redirect:"error",cache:"no-store"});}
  catch {throw new ApiError(502,"A külső szolgáltató nem érhető el, időtúllépés vagy TLS-hiba történt.");}
}
async function providerJson(response:Response) {
  try {
    const reader=response.body?.getReader();
    if(!reader) throw new Error("Empty provider response");
    const chunks:Uint8Array[]=[];
    let total=0;
    while(true) {
      const {done,value}=await reader.read();
      if(done) break;
      total+=value.byteLength;
      if(total>1024*1024) {await reader.cancel();throw new Error("Oversized provider response");}
      chunks.push(value);
    }
    const bytes=new Uint8Array(total);let offset=0;
    for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {throw new ApiError(502,"A szolgáltató nem értelmezhető választ adott.");}
}
const point=z.strictObject({lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180)});
export const routingSchema=z.strictObject({provider:z.enum(["here","google"]),origin:point,destination:point,truck:z.strictObject({grossWeightKg:z.number().positive().max(250000).optional(),heightCm:z.number().positive().max(1000).optional(),widthCm:z.number().positive().max(1000).optional(),lengthCm:z.number().positive().max(10000).optional()}).optional()});
type RoutingInput=z.infer<typeof routingSchema>;
export interface RouteResult {provider:"here"|"google";kilometers:number;minutes:number;truckRestrictionsApplied:boolean;calculatedAt:string;notice:string}

export async function calculateRoute(user:SessionUser,input:RoutingInput,env:Environment=process.env,fetcher:Fetch=fetch):Promise<RouteResult> {
  if (!["admin","dispatcher"].includes(user.role)) throw new ApiError(403,"Útvonalat adminisztrátor vagy fuvarszervező kérhet le.");
  const data=routingSchema.parse(input);
  assertConfigured(user,data.provider,env);
  let meters:number,seconds:number;
  if (data.provider === "here") {
    const url=new URL("https://router.hereapi.com/v8/routes");
    url.searchParams.set("apiKey",env.TMS_HERE_API_KEY!);
    url.searchParams.set("transportMode","truck");
    url.searchParams.set("origin",`${data.origin.lat},${data.origin.lng}`);
    url.searchParams.set("destination",`${data.destination.lat},${data.destination.lng}`);
    url.searchParams.set("return","summary");
    for (const [key,value] of Object.entries(data.truck || {})) {
      const parameter={grossWeightKg:"grossWeight",heightCm:"height",widthCm:"width",lengthCm:"length"}[key];
      if (value!==undefined && parameter) url.searchParams.set(`vehicle[${parameter}]`,String(value));
    }
    const response=await call(fetcher,url);
    if (!response.ok) throw new ApiError(502,`A HERE nem fogadta el a kérést (HTTP ${response.status}). Ellenőrizd a kulcs jogosultságát és keretét.`);
    const result=z.object({routes:z.array(z.object({sections:z.array(z.object({summary:z.object({length:z.number().nonnegative(),duration:z.number().nonnegative()})})).min(1)})).min(1)}).safeParse(await providerJson(response));
    if (!result.success) throw new ApiError(502,"A HERE nem adott értelmezhető útvonalat.");
    meters=result.data.routes[0].sections.reduce((sum,section) => sum+section.summary.length,0);
    seconds=result.data.routes[0].sections.reduce((sum,section) => sum+section.summary.duration,0);
  } else {
    if (data.truck && Object.keys(data.truck).length) throw new ApiError(422,"A Google DRIVE útvonal nem kezel teherautó-méretkorlátozásokat. Válaszd a HERE szolgáltatót.");
    const location=(p:{lat:number;lng:number}) => ({location:{latLng:{latitude:p.lat,longitude:p.lng}}});
    const response=await call(fetcher,"https://routes.googleapis.com/directions/v2:computeRoutes",{method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":env.TMS_GOOGLE_MAPS_API_KEY!,"X-Goog-FieldMask":"routes.distanceMeters,routes.duration"},body:JSON.stringify({origin:location(data.origin),destination:location(data.destination),travelMode:"DRIVE",routingPreference:"TRAFFIC_AWARE",languageCode:"hu-HU",units:"METRIC"})});
    if (!response.ok) throw new ApiError(502,`A Google nem fogadta el a kérést (HTTP ${response.status}). Ellenőrizd a kulcs jogosultságát és keretét.`);
    const result=z.object({routes:z.array(z.object({distanceMeters:z.number().nonnegative(),duration:z.string().regex(/^\d+(\.\d+)?s$/)})).min(1)}).safeParse(await providerJson(response));
    if (!result.success) throw new ApiError(502,"A Google nem adott értelmezhető útvonalat.");
    meters=result.data.routes[0].distanceMeters;
    seconds=Number.parseFloat(result.data.routes[0].duration);
  }
  return {provider:data.provider,kilometers:Math.round(meters/100)/10,minutes:Math.ceil(seconds/60),truckRestrictionsApplied:data.provider==="here",calculatedAt:new Date().toISOString(),notice:data.provider==="here" ? "HERE teherautós útvonal; járműméret- és tömegkorlátozások csak megadott paraméterekkel. ADR és vezetési/pihenőidő külön ellenőrzendő." : "Google DRIVE útvonal; tehergépjárműves méret- és ADR-korlátozások ellenőrzése nélkül."};
}

async function testSap(env:Environment,fetcher:Fetch) {
  const base=env.TMS_SAP_BASE_URL!.replace(/\/$/,"");
  const response=await call(fetcher,`${base}/Login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({CompanyDB:env.TMS_SAP_COMPANY_DB,UserName:env.TMS_SAP_USERNAME,Password:env.TMS_SAP_PASSWORD})});
  if (!response.ok) throw new ApiError(502,`A SAP belépés sikertelen (HTTP ${response.status}).`);
  const cookies=response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).filter((cookie) => /^(B1SESSION|ROUTEID)=/.test(cookie));
  if (!cookies.some((cookie) => cookie.startsWith("B1SESSION="))) {
    const result=z.object({SessionId:z.string().regex(/^[A-Za-z0-9_-]+$/)}).safeParse(await providerJson(response));
    if (!result.success) throw new ApiError(502,"A SAP nem adott érvényes munkamenetet.");
    cookies.push(`B1SESSION=${result.data.SessionId}`);
  }
  const headers={Cookie:cookies.join("; ")};
  try {
    const metadata=await call(fetcher,`${base}/$metadata`,{headers});
    if (!metadata.ok) throw new ApiError(502,`A SAP metaadat nem olvasható (HTTP ${metadata.status}).`);
    return "A SAP Service Layer belépés és metaadat-olvasás sikeres. Üzleti adat nem került feladásra.";
  } finally {
    try {await call(fetcher,`${base}/Logout`,{method:"POST",headers});} catch { /* Session expires on the SAP server; no credentials are persisted. */ }
  }
}
export async function testIntegration(user:SessionUser,id:IntegrationId,env:Environment=process.env,fetcher:Fetch=fetch) {
  if (user.role !== "admin") throw new ApiError(403,"Kapcsolatot csak adminisztrátor tesztelhet.");
  assertConfigured(user,id,env);
  let message:string;
  if (id === "here" || id === "google") {
    const route=await calculateRoute(user,{provider:id,origin:{lat:47.4979,lng:19.0402},destination:{lat:47.511,lng:19.058}},env,fetcher);
    message=`A ${id === "here" ? "HERE" : "Google"} útvonalkérés sikeres: ${route.kilometers} km, ${route.minutes} perc. A szolgáltatói díjszabás érvényes.`;
  } else if (id === "sap") message=await testSap(env,fetcher);
  else if (id === "webhook") {
    const response=await call(fetcher,env.TMS_WEBHOOK_URL!,{method:"HEAD"});
    if (!response.ok) throw new ApiError(502,`A webhook HEAD ellenőrzés nem sikerült (HTTP ${response.status}). Adatküldés nem történt.`);
    message="A HTTPS végpont elérhető. Csak HEAD ellenőrzés történt; eseményküldés nincs aktiválva.";
  } else throw new ApiError(503,"A szolgáltatói illesztés még nincs aktiválva.");
  return {ok:true,message,checkedAt:new Date().toISOString()};
}
