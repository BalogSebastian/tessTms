export const IMPORT_COLUMNS = [
  "reference",
  "partner",
  "from",
  "to",
  "price",
  "currency",
  "kg",
] as const;
export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

const isBlank = (value: unknown) =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && !value.trim());
const csvCell = (value: string) =>
  /[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/** Map the first worksheet to the same canonical CSV contract used by the domain validator. */
export function spreadsheetRowsToCsv(
  rows: readonly (readonly unknown[])[],
): string {
  if (!rows.length) throw new Error("Az első munkalap üres.");
  const header = [...rows[0]];
  while (header.length && isBlank(header.at(-1))) header.pop();
  const names = header.map((value, index) => {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Az ${index + 1}. oszlophoz szöveges fejléc szükséges.`);
    }
    return value
      .replace(/^\ufeff/, "")
      .trim()
      .toLowerCase();
  });
  const duplicates = [
    ...new Set(names.filter((name, index) => names.indexOf(name) !== index)),
  ];
  if (duplicates.length) {
    throw new Error(
      `Ismétlődő oszlopfejléc: ${duplicates.join(", ")}. Minden mező egyszer szerepelhet.`,
    );
  }
  const unknown = names.filter(
    (name) => !IMPORT_COLUMNS.includes(name as (typeof IMPORT_COLUMNS)[number]),
  );
  const missing = IMPORT_COLUMNS.filter((name) => !names.includes(name));
  if (unknown.length || missing.length) {
    throw new Error(
      [
        unknown.length ? `Ismeretlen oszlop: ${unknown.join(", ")}.` : "",
        missing.length ? `Hiányzó oszlop: ${missing.join(", ")}.` : "",
        "A CSV-sablon fejlécét használd az Excel első sorában is.",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  const data = rows
    .slice(1)
    .map((row, index) => ({ row, line: index + 2 }))
    .filter(({ row }) => row.some((value) => !isBlank(value)));
  if (!data.length) throw new Error("Az első munkalap nem tartalmaz adatsort.");
  if (data.length > IMPORT_MAX_ROWS)
    throw new Error(
      `Egy import legfeljebb ${IMPORT_MAX_ROWS} adatsort tartalmazhat.`,
    );
  const result = [IMPORT_COLUMNS.join(";")];
  for (const { row, line } of data) {
    if (row.slice(names.length).some((value) => !isBlank(value))) {
      throw new Error(`${line}. sor: fejléc nélküli oszlopban is van adat.`);
    }
    const values = IMPORT_COLUMNS.map((column) => {
      const value = row[names.indexOf(column)];
      if (isBlank(value)) return "";
      if (typeof value !== "string" && typeof value !== "number") {
        throw new Error(
          `${line}. sor, ${column}: csak szöveg vagy szám használható; dátum és logikai cella nem.`,
        );
      }
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error(`${line}. sor, ${column}: érvénytelen szám.`);
      }
      const text = String(value).trim();
      if (text.length > 10000)
        throw new Error(`${line}. sor, ${column}: túl hosszú cellatartalom.`);
      return csvCell(text);
    });
    result.push(values.join(";"));
  }
  return result.join("\n");
}

/** The XLSX reader and its worker are downloaded only after choosing an Excel file. */
export async function readImportSpreadsheet(file: File): Promise<string> {
  if (!/\.xlsx$/i.test(file.name))
    throw new Error(
      "Excel-importhoz .xlsx fájl szükséges. A régi .xls formátumot mentsd .xlsx-ként.",
    );
  if (!file.size) throw new Error("A kiválasztott fájl üres.");
  if (file.size > IMPORT_MAX_BYTES)
    throw new Error("Legfeljebb 5 MB-os Excel-fájl olvasható be.");
  let rows: unknown[][];
  try {
    const { readSheet } = await import("read-excel-file/browser");
    rows = await readSheet(await file.arrayBuffer(), 1);
  } catch {
    throw new Error(
      "Az Excel-fájl nem olvasható. Érvényes, jelszó nélküli .xlsx munkafüzetet válassz.",
    );
  }
  return spreadsheetRowsToCsv(rows);
}
