export interface TableColumnDefinition {
  id: string;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  defaultHidden?: boolean;
}
export interface TablePreferences {
  schema: 1;
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
  density: "compact" | "comfortable";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
export function columnWidthBounds(column: TableColumnDefinition) {
  const min = finite(column.minWidth)
    ? Math.max(80, Math.min(600, column.minWidth))
    : 80;
  const max = finite(column.maxWidth)
    ? Math.max(min, Math.min(600, column.maxWidth))
    : 600;
  return { min, max };
}
export function clampColumnWidth(
  column: TableColumnDefinition,
  width: unknown,
) {
  const { min, max } = columnWidthBounds(column);
  const candidate = finite(width)
    ? width
    : finite(column.width)
      ? column.width
      : 160;
  return Math.round(Math.max(min, Math.min(max, candidate)));
}
export function defaultTablePreferences(
  columns: readonly TableColumnDefinition[],
): TablePreferences {
  const order = [...new Set(columns.map((column) => column.id))];
  const hidden = columns
    .filter((column) => column.defaultHidden)
    .map((column) => column.id);
  if (order.length && hidden.length === order.length)
    hidden.splice(hidden.indexOf(order[0]), 1);
  return {
    schema: 1,
    order,
    hidden,
    widths: Object.fromEntries(
      columns.map((column) => [
        column.id,
        clampColumnWidth(column, column.width),
      ]),
    ),
    density: "compact",
  };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Persisted data is UI preference only: unknown columns and malformed values never enter the table. */
export function parseTablePreferences(
  raw: string | null,
  columns: readonly TableColumnDefinition[],
): TablePreferences {
  const defaults = defaultTablePreferences(columns);
  if (!raw) return defaults;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (!record(saved)) return defaults;
  // Accept the first unversioned format, then write the canonical schema on the next change.
  if (saved.schema !== 1 && saved.schema !== undefined && saved.schema !== 0)
    return defaults;
  const known = new Set(defaults.order);
  const order = Array.isArray(saved.order)
    ? [
        ...new Set(
          saved.order.filter(
            (id): id is string => typeof id === "string" && known.has(id),
          ),
        ),
      ]
    : [];
  order.push(...defaults.order.filter((id) => !order.includes(id)));
  const hidden = Array.isArray(saved.hidden)
    ? [
        ...new Set(
          saved.hidden.filter(
            (id): id is string => typeof id === "string" && known.has(id),
          ),
        ),
      ]
    : defaults.hidden;
  if (Array.isArray(saved.order)) {
    const previousColumns = new Set(saved.order);
    hidden.push(
      ...columns
        .filter(
          (column) =>
            column.defaultHidden &&
            !previousColumns.has(column.id) &&
            !hidden.includes(column.id),
        )
        .map((column) => column.id),
    );
  }
  if (order.length && order.every((id) => hidden.includes(id)))
    hidden.splice(hidden.indexOf(order[0]), 1);
  const widths = record(saved.widths) ? saved.widths : {};
  return {
    schema: 1,
    order,
    hidden,
    widths: Object.fromEntries(
      columns.map((column) => [
        column.id,
        clampColumnWidth(column, widths[column.id]),
      ]),
    ),
    density: saved.density === "comfortable" ? "comfortable" : "compact",
  };
}
export function resizeTableColumn(
  preferences: TablePreferences,
  columns: readonly TableColumnDefinition[],
  id: string,
  width: number,
): TablePreferences {
  const column = columns.find((item) => item.id === id);
  if (!column) return preferences;
  return {
    ...preferences,
    widths: { ...preferences.widths, [id]: clampColumnWidth(column, width) },
  };
}
export function toggleTableColumn(
  preferences: TablePreferences,
  id: string,
): TablePreferences {
  if (!preferences.order.includes(id)) return preferences;
  const hidden = preferences.hidden.includes(id)
    ? preferences.hidden.filter((item) => item !== id)
    : [...preferences.hidden, id];
  if (preferences.order.every((item) => hidden.includes(item)))
    return preferences;
  return { ...preferences, hidden };
}
export function moveTableColumn(
  preferences: TablePreferences,
  id: string,
  direction: -1 | 1,
): TablePreferences {
  const index = preferences.order.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= preferences.order.length)
    return preferences;
  const order = [...preferences.order];
  [order[index], order[target]] = [order[target], order[index]];
  return { ...preferences, order };
}
