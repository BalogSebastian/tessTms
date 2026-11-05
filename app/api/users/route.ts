import { body, handle, json, requireUser, sameOrigin } from "../../../lib/server/http";
import { repository } from "../../../lib/server/repository";
import { userSchema } from "../../../lib/server/schema";
export const runtime = "nodejs";
export async function GET(request: Request) { return handle(() => json({users:repository().users(requireUser(request))})); }
export async function POST(request: Request) {
  return handle(async () => { sameOrigin(request); const user=requireUser(request); return json({user:repository().addUser(user,await body(request,userSchema))},201); });
}
