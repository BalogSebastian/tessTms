import { body, cookie, handle, json, sameOrigin } from "../../../../lib/server/http";
import { repository } from "../../../../lib/server/repository";
import { setupSchema } from "../../../../lib/server/schema";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    const data = await body(request,setupSchema);
    const repo = repository();
    const user = repo.createWorkspace(data,true);
    return json({user},201,{"Set-Cookie":cookie(request,repo.createSession(user))});
  });
}
