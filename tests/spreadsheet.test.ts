import assert from "node:assert/strict";
import test from "node:test";
import { readSheet } from "read-excel-file/universal";
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  readImportSpreadsheet,
  spreadsheetRowsToCsv,
} from "../lib/tms/spreadsheet";
import { importOrders, parseCsv } from "../lib/tms/import";
import { seed } from "../lib/tms/seed";

// A minimal real OOXML workbook: reordered headers, Hungarian text and numeric cells.
const WORKBOOK =
  "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";
const row = [
  "XLSX-001",
  "Duna Útépítő Kft.",
  "Győr",
  "Budapest",
  245000,
  "HUF",
  18000,
];

test("real XLSX workbook reaches the existing order validation without losing numeric or Hungarian data", async () => {
  const bytes = Buffer.from(WORKBOOK, "base64");
  const rows = await readSheet(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const csv = spreadsheetRowsToCsv(rows);
  const orders = importOrders(structuredClone(seed), csv, "excel-batch");
  assert.equal(orders.length, 1);
  assert.equal(orders[0].reference, "XLSX-001");
  assert.equal(orders[0].stops[0].city, "Győr");
  assert.equal(orders[0].price, 245000);
  assert.equal(orders[0].cargo.kg, 18000);
  assert.equal(orders[0].batchId, "excel-batch");
});

test("Excel values containing separators, quotes and newlines survive canonical CSV conversion", () => {
  const special = [...row];
  special[2] = 'Győr; "A" raktár\nKapu 2';
  const csv = spreadsheetRowsToCsv([IMPORT_COLUMNS, [], special]);
  assert.equal(parseCsv(csv)[1][2], special[2]);
});

test("unknown, duplicated and missing Excel columns are rejected explicitly", () => {
  assert.throws(
    () => spreadsheetRowsToCsv([[...IMPORT_COLUMNS, "secret"], row]),
    /Ismeretlen oszlop: secret/,
  );
  assert.throws(
    () => spreadsheetRowsToCsv([[...IMPORT_COLUMNS.slice(0, 6), "price"], row]),
    /Ismétlődő oszlopfejléc: price/,
  );
  assert.throws(
    () => spreadsheetRowsToCsv([IMPORT_COLUMNS.slice(0, 6), row]),
    /Hiányzó oszlop: kg/,
  );
});

test("unexpected cells, dates and boolean values report their actual worksheet row", () => {
  assert.throws(
    () => spreadsheetRowsToCsv([IMPORT_COLUMNS, [...row, "extra"]]),
    /2. sor: fejléc nélküli/,
  );
  const invalid: unknown[] = [...row];
  invalid[4] = true;
  assert.throws(
    () => spreadsheetRowsToCsv([IMPORT_COLUMNS, [], invalid]),
    /3. sor, price/,
  );
  invalid[4] = new Date();
  assert.throws(
    () => spreadsheetRowsToCsv([IMPORT_COLUMNS, invalid]),
    /2. sor, price/,
  );
});

test("1000 rows are accepted atomically by the shared order importer, larger sheets are rejected", () => {
  const data = Array.from({ length: IMPORT_MAX_ROWS }, (_, index) => [
    `XLSX-${index}`,
    "Duna Útépítő Kft.",
    "Győr",
    "Budapest",
    1,
    "HUF",
    1,
  ]);
  const csv = spreadsheetRowsToCsv([IMPORT_COLUMNS, ...data]);
  const state = structuredClone(seed);
  assert.equal(importOrders(state, csv, "excel-limit").length, IMPORT_MAX_ROWS);
  assert.equal(
    state.orders.length,
    seed.orders.length,
    "preview must not mutate the workspace",
  );
  assert.throws(
    () => spreadsheetRowsToCsv([IMPORT_COLUMNS, ...data, data[0]]),
    /legfeljebb 1000/,
  );
});

test("legacy or oversized files are refused before loading the Excel parser", async () => {
  await assert.rejects(
    readImportSpreadsheet(new File(["not an Excel file"], "legacy.xls")),
    /\.xlsx fájl szükséges/,
  );
  await assert.rejects(
    readImportSpreadsheet(
      new File([new Uint8Array(IMPORT_MAX_BYTES + 1)], "large.xlsx"),
    ),
    /5 MB/,
  );
  await assert.rejects(
    readImportSpreadsheet(new File([], "empty.xlsx")),
    /üres/,
  );
});
