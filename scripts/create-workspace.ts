/** Provision an independent customer workspace. JSON credentials are accepted on stdin only. */
import { repository } from "../lib/server/repository";

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  try {
    const user = repository().createWorkspace(JSON.parse(input));
    process.stdout.write(`Munkatér létrehozva: ${user.workspaceName} (${user.workspaceId})\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof SyntaxError ? "Érvénytelen JSON bemenet." : error instanceof Error ? error.message : "Sikertelen létrehozás"}\n`);
    process.exitCode = 1;
  }
}
void main();
