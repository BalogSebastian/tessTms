import { body, cookie, handle, json, requireUser, sameOrigin } from "../../../../lib/server/http";
import { repository } from "../../../../lib/server/repository";
import { passwordChangeSchema } from "../../../../lib/server/schema";
export const runtime="nodejs";
export async function POST(request:Request) {
  return handle(async () => {sameOrigin(request);const current=requireUser(request);const data=await body(request,passwordChangeSchema);const repo=repository();const user=repo.changePassword(current,data);return json({user},200,{"Set-Cookie":cookie(request,repo.createSession(user))});});
}
