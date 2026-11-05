import { ZodError, type ZodType } from "zod";
import { ApiError } from "./errors";
import { repository, SESSION_SECONDS } from "./repository";

export const COOKIE_NAME = "tess_session";
export function sessionToken(request: Request) {
  return request.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length+1);
}
export function requireUser(request: Request) {
  const user = repository().session(sessionToken(request));
  if (!user) throw new ApiError(401,"Jelentkezz be a munkatér eléréséhez.");
  return user;
}
export function sameOrigin(request: Request) {
  const expected = new URL(process.env.TMS_PUBLIC_URL || request.url).origin;
  if (request.headers.get("origin") !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403,"A módosítás csak a saját alkalmazásból indítható.");
}
export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data,{status,headers:{"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff",...headers}});
}
export function cookie(request: Request, token: string, clear = false) {
  const secure = new URL(process.env.TMS_PUBLIC_URL || request.url).protocol === "https:";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_SECONDS}${secure ? "; Secure" : ""}`;
}
export async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError(415,"JSON kérés szükséges.");
  const raw = await boundedBody(request, 8 * 1024 * 1024);
  try { return schema.parse(JSON.parse(new TextDecoder().decode(raw))); }
  catch (error) { if (error instanceof ZodError) throw error; throw new ApiError(400,"Érvénytelen JSON kérés."); }
}
export async function boundedBody(request: Request, maximum: number) {
  if (Number(request.headers.get("content-length")) > maximum) throw new ApiError(413,"A kérés túl nagy.");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) { await reader.cancel(); throw new ApiError(413,"A kérés túl nagy."); }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk,offset); offset += chunk.length; }
  return result;
}
export async function handle(fn: () => Response | Promise<Response>) {
  try { return await fn(); }
  catch (error) {
    if (error instanceof ApiError) return json({error:error.message},error.status);
    if (error instanceof ZodError) return json({error:`Érvénytelen adat: ${error.issues[0]?.path.join(".")} · ${error.issues[0]?.message}`},422);
    console.error("TMS API request failed",error instanceof Error ? error.message : "Unknown error");
    return json({error:"A szerver nem tudta végrehajtani a műveletet."},500);
  }
}
