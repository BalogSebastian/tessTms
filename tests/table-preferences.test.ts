import test from "node:test";
import assert from "node:assert/strict";
import {
  clampColumnWidth,
  defaultTablePreferences,
  moveTableColumn,
  parseTablePreferences,
  resizeTableColumn,
  toggleTableColumn,
  type TableColumnDefinition,
} from "../lib/tms/table-preferences";

const columns: TableColumnDefinition[] = [
  { id: "reference", width: 220, minWidth: 160, maxWidth: 400 },
  { id: "route", width: 250, minWidth: 120 },
  { id: "price", width: 130, minWidth: 100, maxWidth: 260 },
  { id: "driver", width: 160, defaultHidden: true },
];
test("corrupted or newer stored table preferences safely restore the usable default view", () => {
  const expected = defaultTablePreferences(columns);
  for (const raw of [
    null,
    "{broken",
    "[]",
    "null",
    JSON.stringify({ schema: 5, order: ["route"], hidden: ["reference"] }),
  ])
    assert.deepEqual(parseTablePreferences(raw, columns), expected);
});
test("known column order survives migration while removed, duplicated and new IDs are reconciled", () => {
  const saved = JSON.stringify({
    schema: 0,
    order: ["price", "obsolete", "price", "reference"],
    hidden: ["route", "obsolete", "route"],
    widths: { price: 180, obsolete: 900 },
    density: "comfortable",
  });
  const result = parseTablePreferences(saved, columns);
  assert.deepEqual(result.order, ["price", "reference", "route", "driver"]);
  assert.deepEqual(result.hidden, ["route", "driver"]);
  assert.equal(result.widths.price, 180);
  assert.equal(result.widths.reference, 220);
  assert.equal(result.density, "comfortable");
  assert.equal(result.schema, 1);
});
test("invalid stored widths cannot distort the table or escape individual column bounds", () => {
  const result = parseTablePreferences(
    JSON.stringify({
      schema: 1,
      widths: { reference: 99999, route: -15, price: "500", driver: null },
      density: "unknown",
    }),
    columns,
  );
  assert.deepEqual(result.widths, {
    reference: 400,
    route: 120,
    price: 130,
    driver: 160,
  });
  assert.equal(result.density, "compact");
  assert.equal(
    clampColumnWidth(
      { id: "x", width: Infinity, minWidth: -40, maxWidth: 9999 },
      NaN,
    ),
    160,
  );
  assert.equal(
    clampColumnWidth({ id: "x", width: 100, minWidth: 300, maxWidth: 200 }, 80),
    300,
  );
});
test("hiding the final visible column is rejected and malformed all-hidden data recovers one", () => {
  let preferences = defaultTablePreferences(columns);
  preferences = toggleTableColumn(preferences, "reference");
  preferences = toggleTableColumn(preferences, "route");
  assert.equal(toggleTableColumn(preferences, "price"), preferences);
  const restored = parseTablePreferences(
    JSON.stringify({ ...preferences, hidden: columns.map((c) => c.id) }),
    columns,
  );
  assert.equal(restored.hidden.includes(restored.order[0]), false);
  assert.equal(
    restored.order.filter((id) => !restored.hidden.includes(id)).length,
    1,
  );
});
test("reordering preserves hidden columns, personal widths and density without mutating earlier preferences", () => {
  const before = {
    ...defaultTablePreferences(columns),
    density: "comfortable" as const,
  };
  const sized = resizeTableColumn(before, columns, "route", 375);
  const moved = moveTableColumn(sized, "driver", -1);
  assert.deepEqual(moved.order, ["reference", "route", "driver", "price"]);
  assert.deepEqual(moved.hidden, ["driver"]);
  assert.equal(moved.widths.route, 375);
  assert.equal(moved.density, "comfortable");
  assert.deepEqual(before.order, ["reference", "route", "price", "driver"]);
  assert.equal(before.widths.route, 250);
  assert.equal(moveTableColumn(moved, "reference", -1), moved);
  assert.equal(resizeTableColumn(moved, columns, "unknown", 200), moved);
});
