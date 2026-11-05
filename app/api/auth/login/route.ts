import { body, cookie, handle, json, sameOrigin } from "../../../../lib/server/http";
import { repository } from "../../../../lib/server/repository";
import { credentialsSchema } from "../../../../lib/server/schema";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    const data = await body(request,credentialsSchema);
    const repo = repository();
    const user = repo.login(data.email,data.password);
    return json({user},200,{"Set-Cookie":cookie(request,repo.createSession(user))});
  });
}
