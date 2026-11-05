import { body, handle, json, requireUser, sameOrigin } from "../../../../lib/server/http";
import { repository } from "../../../../lib/server/repository";
import { userUpdateSchema } from "../../../../lib/server/schema";
export const runtime="nodejs";
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}) {
  return handle(async () => {sameOrigin(request);const user=requireUser(request);const data=await body(request,userUpdateSchema);return json({user:repository().updateUser(user,(await context.params).id,data)});});
}
