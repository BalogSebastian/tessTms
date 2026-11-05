import { handle, json, sessionToken } from "../../../lib/server/http";
import { repository } from "../../../lib/server/repository";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(() => { const repo = repository(); return json({user:repo.session(sessionToken(request)),needsSetup:repo.needsSetup()}); });
}
