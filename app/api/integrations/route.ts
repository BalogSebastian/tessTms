import { handle, json, requireUser } from "../../../lib/server/http";
import { integrationScope, listIntegrations } from "../../../lib/server/integrations";
export const runtime="nodejs";
export async function GET(request:Request) {
  return handle(() => {const user=requireUser(request);return json({integrations:listIntegrations(user),scope:{workspaceBound:integrationScope(user),workspaceId:integrationScope(user) ? user.workspaceId : null}});});
}
