import { handle, json, requireUser } from "../../../lib/server/http";
import { repository } from "../../../lib/server/repository";
export const runtime = "nodejs";
export async function GET(request: Request) { return handle(() => json({events:repository().audit(requireUser(request))})); }
