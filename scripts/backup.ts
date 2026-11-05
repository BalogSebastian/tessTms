import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { repository } from "../lib/server/repository";

const target = process.argv[2];
if (!target) throw new Error("Használat: npx tsx scripts/backup.ts /biztonsagos/hely/tess-backup.sqlite");
const output=resolve(target);
if (existsSync(output)) throw new Error("A célfájl már létezik. Adj meg új fájlnevet.");
mkdirSync(dirname(output),{recursive:true,mode:0o700});
repository().db.prepare("VACUUM INTO ?").run(output);
chmodSync(output,0o600);
process.stdout.write(`Konzisztens adatbázismentés elkészült: ${output}\n`);
