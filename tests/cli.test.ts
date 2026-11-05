import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("customer provisioning and consistent backup CLIs execute with the repository module configuration", () => {
  const directory = mkdtempSync(join(tmpdir(), "tess-cli-"));
  const database = join(directory, "source.sqlite");
  const backup = join(directory, "backup.sqlite");
  const env = { ...process.env, TMS_DATABASE_PATH: database };
  const password = "cli-secret-password-2026";
  try {
    const created = spawnSync(process.execPath, ["--import", "tsx", "scripts/create-workspace.ts"], {
      cwd: process.cwd(), env, encoding: "utf8",
      input: JSON.stringify({name:"CLI Admin",email:"cli@tess.invalid",password,workspaceName:"CLI ügyfél",sampleData:false}),
    });
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /Munkatér létrehozva: CLI ügyfél/);
    assert.equal((created.stdout + created.stderr).includes(password), false);
    assert.equal(existsSync(database), true);
    const saved = spawnSync(process.execPath, ["--import", "tsx", "scripts/backup.ts", backup], {cwd:process.cwd(),env,encoding:"utf8"});
    assert.equal(saved.status, 0, saved.stderr);
    assert.equal(existsSync(backup), true);
    const overwritten = spawnSync(process.execPath, ["--import", "tsx", "scripts/backup.ts", backup], {cwd:process.cwd(),env,encoding:"utf8"});
    assert.notEqual(overwritten.status, 0);
    assert.match(overwritten.stderr, /már létezik/);
  } finally { rmSync(directory, {recursive:true,force:true}); }
});
