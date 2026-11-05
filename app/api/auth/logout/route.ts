import { cookie, handle, json, sameOrigin, sessionToken } from "../../../../lib/server/http";
import { repository } from "../../../../lib/server/repository";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(() => { sameOrigin(request); repository().logout(sessionToken(request)); return json({ok:true},200,{"Set-Cookie":cookie(request,"",true)}); });
}
