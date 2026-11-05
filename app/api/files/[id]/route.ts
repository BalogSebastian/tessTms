import { boundedBody, handle, json, requireUser, sameOrigin } from "../../../../lib/server/http";
import { repository } from "../../../../lib/server/repository";
import { ApiError } from "../../../../lib/server/errors";
export const runtime = "nodejs";
type Context = {params:Promise<{id:string}>};
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const user = requireUser(request);
    const file = repository().getFile(user,(await context.params).id);
    return new Response(new Uint8Array(file.bytes),{headers:{"Content-Type":file.mime,"Content-Length":String(file.bytes.length),"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"}});
  });
}
export async function PUT(request: Request, context: Context) {
  return handle(async () => {
    sameOrigin(request);
    const user=requireUser(request);
    const {id}=await context.params;
    let name: string;
    try { name=decodeURIComponent(request.headers.get("x-file-name") || ""); } catch { throw new ApiError(400,"Érvénytelen fájlnév."); }
    const mime=(request.headers.get("content-type") || "application/octet-stream").split(";")[0];
    repository().putFile(user,id,name,mime,await boundedBody(request,20*1024*1024));
    return json({id,name},201);
  });
}
