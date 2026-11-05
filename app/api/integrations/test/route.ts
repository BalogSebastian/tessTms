import { z } from "zod";
import { body, handle, json, requireUser, sameOrigin } from "../../../../lib/server/http";
import { ApiError } from "../../../../lib/server/errors";
import { integrationId, testIntegration } from "../../../../lib/server/integrations";
export const runtime="nodejs";
export async function POST(request:Request) {
  return handle(async () => {
    sameOrigin(request);const user=requireUser(request);const data=await body(request,z.strictObject({id:integrationId}));
    try {return json(await testIntegration(user,data.id));}
    catch(error) {if(error instanceof ApiError && error.status===502) return json({ok:false,message:error.message,checkedAt:new Date().toISOString()},502);throw error;}
  });
}
