import { body, handle, json, requireUser, sameOrigin } from "../../../lib/server/http";
import { repository } from "../../../lib/server/repository";
import { workspaceSchema } from "../../../lib/server/schema";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(() => json(repository().readWorkspace(requireUser(request))));
}
export async function PUT(request: Request) {
  return handle(async () => { sameOrigin(request); const user = requireUser(request); const data = await body(request,workspaceSchema); return json(repository().saveWorkspace(user,data)); });
}
