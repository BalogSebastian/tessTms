import { notFound } from "next/navigation";
import { modules } from "../../lib/tms/catalog";
import ModuleRouter from "../../components/platform/module-router";
export function generateStaticParams() {
  return [
    ...modules
      .filter((m) => m.key !== "overview")
      .map((m) => ({ module: m.key })),
    { module: "new-order" },
  ];
}
export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  if (module !== "new-order" && !modules.some((m) => m.key === module))
    notFound();
  return <ModuleRouter moduleKey={module} />;
}
