import { body, handle, json, requireUser, sameOrigin } from "../../../../lib/server/http";
import { calculateRoute, routingSchema } from "../../../../lib/server/integrations";
export const runtime="nodejs";
export async function POST(request:Request) {
  return handle(async () => {sameOrigin(request);const user=requireUser(request);const data=await body(request,routingSchema);return json(await calculateRoute(user,data));});
}
