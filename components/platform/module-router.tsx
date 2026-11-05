"use client";
import dynamic from "next/dynamic";
import WorkspaceShell from "./workspace-shell";
import Dashboard from "./modules/dashboard";
const modules = {
  overview: Dashboard,
  orders: dynamic(() => import("./modules/orders")),
  "new-order": dynamic(() => import("./modules/new-order")),
  intake: dynamic(() => import("./modules/intake")),
  dispatch: dynamic(() => import("./modules/dispatch")),
  routes: dynamic(() => import("./modules/routes")),
  driver: dynamic(() => import("./modules/driver")),
  finance: dynamic(() => import("./modules/finance")),
  billing: dynamic(() => import("./modules/billing")),
  procurement: dynamic(() => import("./modules/procurement")),
  fleet: dynamic(() => import("./modules/fleet")),
  documents: dynamic(() => import("./modules/documents")),
  analytics: dynamic(() => import("./modules/analytics")),
  partners: dynamic(() => import("./modules/partners")),
  inventory: dynamic(() => import("./modules/inventory")),
  integrations: dynamic(() => import("./modules/integrations")),
  group: dynamic(() => import("./modules/group")),
  optimization: dynamic(() => import("./modules/optimization")),
  scan: dynamic(() => import("./modules/scan")),
  damage: dynamic(() => import("./modules/damage")),
  assistant: dynamic(() => import("./modules/assistant")),
  settings: dynamic(() => import("./modules/settings")),
};
export default function ModuleRouter({
  moduleKey = "overview",
}: {
  moduleKey?: string;
}) {
  const Component = modules[moduleKey as keyof typeof modules] || Dashboard;
  return (
    <WorkspaceShell active={moduleKey}>
      <Component />
    </WorkspaceShell>
  );
}
