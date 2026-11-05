import assert from "node:assert/strict";
import test from "node:test";
import { TmsRepository } from "../lib/server/repository";
import { validateMutation } from "../lib/server/validation";
import { stateSchema } from "../lib/server/schema";
import { ApiError } from "../lib/server/errors";
import { seed } from "../lib/tms/seed";
import { companies } from "../lib/tms/model";
import { importOrders } from "../lib/tms/import";

const status = (code: number) => (error: unknown) =>
  error instanceof ApiError && error.status === code;

test("an empty customer workspace owns its named company, arbitrary company IDs persist and imports follow the configured master", () => {
  const repo = new TmsRepository(":memory:");
  try {
    const admin = repo.createWorkspace(
      {
        name: "Company Admin",
        email: "companies@example.com",
        password: "company-password-strong-2026",
        workspaceName: "Új Fuvarozó Kft.",
        sampleData: false,
      },
      true,
    );
    const initial = repo.readWorkspace(admin);
    assert.deepEqual(initial.state.companies, [
      { id: "main", name: "Új Fuvarozó Kft.", short: "ÚJ" },
    ]);
    initial.state.companies = [
      { id: "customer-east-2026", name: "Keleti Logisztika Kft.", short: "KL" },
    ];
    initial.state.partners.push(structuredClone(seed.partners[0]));
    const imported = importOrders(
      initial.state,
      "reference;partner;from;to;price;currency;kg\nCUSTOM-001;Duna Útépítő Kft.;Győr;Budapest;200000;HUF;18000",
      "custom-company-batch",
    );
    assert.equal(imported[0].companyId, "customer-east-2026");
    initial.state.orders.push(...imported);
    const saved = repo.saveWorkspace(admin, {
      ...initial,
      action: "Cégtörzs és import",
      entity: "customer-east-2026",
    });
    assert.equal(saved.state.orders[0].companyId, "customer-east-2026");
    saved.state.companies![0].name = "Keleti Logisztika Zrt.";
    const renamed = repo.saveWorkspace(admin, {
      ...saved,
      action: "Cég átnevezve",
      entity: "customer-east-2026",
    });
    assert.equal(renamed.state.orders[0].companyId, "customer-east-2026");
    assert.equal(renamed.state.companies![0].name, "Keleti Logisztika Zrt.");
  } finally {
    repo.close();
  }
});

test("adding a previously absent company-master key cannot bypass role permissions", () => {
  const before = structuredClone(seed);
  delete before.companies;
  const after = structuredClone(before);
  after.companies = [
    ...structuredClone(companies),
    { id: "new-company", name: "Másik Cég Kft.", short: "MC" },
  ];
  assert.throws(
    () => validateMutation(before, after, "dispatcher", () => true),
    status(403),
  );
  assert.throws(
    () => validateMutation(before, after, "finance", () => true),
    status(403),
  );
  assert.doesNotThrow(
    () => stateSchema.parse(before),
    "legacy snapshots without a master remain readable",
  );
});

test("company foreign keys and used-company deletion are validated on the server", () => {
  const before = structuredClone(seed);
  for (const key of [
    "orders",
    "vehicles",
    "drivers",
    "purchases",
    "stock",
  ] as const) {
    const after = structuredClone(before);
    after[key][0].companyId = "unknown-company";
    assert.throws(
      () => validateMutation(before, after, "admin", () => true),
      status(422),
      key,
    );
  }
  const removed = structuredClone(before);
  removed.companies = removed.companies!.filter(
    (company) => company.id !== "steel",
  );
  assert.throws(
    () => validateMutation(before, removed, "admin", () => true),
    status(422),
  );
});

test("reserved company IDs, empty masters and duplicate names are rejected", () => {
  const before = structuredClone(seed);
  assert.equal(
    stateSchema.safeParse({ ...before, companies: [] }).success,
    false,
  );
  assert.equal(
    stateSchema.safeParse({
      ...before,
      companies: [{ id: "all", name: "Fenntartott név", short: "ALL" }],
    }).success,
    false,
  );
  const after = structuredClone(before);
  after.companies!.push({
    id: "duplicate-name",
    name: companies[0].name.toLocaleUpperCase("hu-HU"),
    short: "DU",
  });
  assert.throws(
    () => validateMutation(before, after, "admin", () => true),
    status(422),
  );
});
