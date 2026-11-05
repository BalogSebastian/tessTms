"use client";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  clampColumnWidth,
  columnWidthBounds,
  defaultTablePreferences,
  moveTableColumn,
  parseTablePreferences,
  resizeTableColumn,
  toggleTableColumn,
  type TableColumnDefinition,
  type TablePreferences,
} from "../../../lib/tms/table-preferences";
import { Icon } from "./icon";

export interface WorkTableColumn<T> extends TableColumnDefinition {
  label: string;
  render: (row: T) => ReactNode;
  sortKey?: string;
  sticky?: boolean;
  align?: "left" | "right" | "center";
}
export interface WorkTableProps<T> {
  columns: readonly WorkTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  storageKey: string;
  selection?: {
    selectedIds: readonly string[];
    onToggle: (id: string) => void;
    onToggleAll: (ids: string[]) => void;
    label?: string;
  };
  sort?: {
    key: string;
    direction: "asc" | "desc";
    onSort: (key: string) => void;
  };
  toolbar?: ReactNode;
  ariaLabel?: string;
  emptyTitle?: string;
  emptyText?: string;
}

// Keep an in-memory fallback when a private browser or storage quota prevents persistence.
const memory = new Map<string, string>();
const subscriptions = new Map<string, Set<() => void>>();
function readPreference(key: string) {
  const current = memory.get(key);
  if (current !== undefined) return current;
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}
function writePreference(key: string, preferences: TablePreferences) {
  const raw = JSON.stringify(preferences);
  memory.set(key, raw);
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* Preferences continue to work in this tab. */
  }
  subscriptions.get(key)?.forEach((listener) => listener());
}
function subscribePreference(key: string, listener: () => void) {
  const listeners = subscriptions.get(key) ?? new Set<() => void>();
  subscriptions.set(key, listeners);
  listeners.add(listener);
  function changed(event: StorageEvent) {
    if (event.key === key || event.key === null) {
      if (event.newValue) memory.set(key, event.newValue);
      else memory.delete(key);
      listener();
    }
  }
  window.addEventListener("storage", changed);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) subscriptions.delete(key);
    window.removeEventListener("storage", changed);
  };
}
function usePreferences(
  key: string,
  columns: readonly TableColumnDefinition[],
) {
  const subscribe = useMemo(
    () => (listener: () => void) => subscribePreference(key, listener),
    [key],
  );
  const snapshot = useMemo(() => () => readPreference(key), [key]);
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const preferences = useMemo(
    () => parseTablePreferences(raw, columns),
    [raw, columns],
  );
  return [
    preferences,
    (next: TablePreferences) => writePreference(key, next),
  ] as const;
}
function SelectionCheckbox({
  checked,
  indeterminate,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return (
    <input
      ref={input}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={onChange}
      onClick={(event) => event.stopPropagation()}
    />
  );
}
function interactive(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "a,button,input,select,textarea,[role='button'],[role='checkbox'],[role='separator']",
      ),
    )
  );
}
function settingsPosition(button: HTMLElement | null) {
  if (!button) return { top: 12, left: 12 };
  const rect = button.getBoundingClientRect();
  const height = Math.min(520, window.innerHeight - 24);
  return {
    top:
      rect.bottom + height + 8 < window.innerHeight
        ? rect.bottom + 8
        : Math.max(12, rect.top - height - 8),
    left: Math.max(12, Math.min(rect.right - 350, window.innerWidth - 362)),
  };
}
interface Drag {
  id: string;
  startX: number;
  startWidth: number;
  width: number;
}

export function WorkTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  storageKey,
  selection,
  sort,
  toolbar,
  ariaLabel = "Fuvarok",
  emptyTitle = "Nincs találat ebben a nézetben.",
  emptyText = "Módosítsd a szűrőket, vagy hozz létre új megbízást.",
}: WorkTableProps<T>) {
  const [preferences, save] = usePreferences(storageKey, columns);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [settingsLocation, setSettingsLocation] = useState({
    top: 12,
    left: 12,
  });
  const [preview, setPreview] = useState<{ id: string; width: number } | null>(
    null,
  );
  const drag = useRef<Drag | null>(null);
  const settings = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const settingsSearch = useRef<HTMLInputElement>(null);
  const settingsId = useId();
  const lookup = new Map(columns.map((column) => [column.id, column]));
  const ordered = preferences.order
    .map((id) => lookup.get(id))
    .filter((column): column is WorkTableColumn<T> => Boolean(column));
  const visible = ordered.filter(
    (column) => !preferences.hidden.includes(column.id),
  );
  const width = (column: WorkTableColumn<T>) =>
    preview?.id === column.id ? preview.width : preferences.widths[column.id];
  let offset = selection ? 44 : 0;
  const sticky = new Map<string, number>();
  for (const column of visible)
    if (column.sticky) {
      sticky.set(column.id, offset);
      offset += width(column);
    }
  const totalWidth = visible.reduce(
    (sum, column) => sum + width(column),
    selection ? 44 : 0,
  );
  const ids = rows.map(rowKey);
  const selected = new Set(selection?.selectedIds ?? []);
  const selectedVisible = ids.filter((id) => selected.has(id)).length;
  const allSelected = ids.length > 0 && selectedVisible === ids.length;
  useEffect(() => {
    if (!settingsOpen) return;
    settingsSearch.current?.focus({ preventScroll: true });
    function outside(event: globalThis.PointerEvent) {
      if (
        !settings.current?.contains(event.target as Node) &&
        !settingsButton.current?.contains(event.target as Node)
      )
        setSettingsOpen(false);
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSettingsOpen(false);
        settingsButton.current?.focus();
      }
    }
    const position = () =>
      setSettingsLocation(settingsPosition(settingsButton.current));
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [settingsOpen]);
  function resizeStart(
    event: PointerEvent<HTMLSpanElement>,
    column: WorkTableColumn<T>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = {
      id: column.id,
      startX: event.clientX,
      startWidth: width(column),
      width: width(column),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPreview({ id: column.id, width: width(column) });
  }
  function resizeMove(
    event: PointerEvent<HTMLSpanElement>,
    column: WorkTableColumn<T>,
  ) {
    if (drag.current?.id !== column.id) return;
    event.preventDefault();
    event.stopPropagation();
    const next = clampColumnWidth(
      column,
      drag.current.startWidth + event.clientX - drag.current.startX,
    );
    drag.current.width = next;
    setPreview({ id: column.id, width: next });
  }
  function resizeEnd(
    event: PointerEvent<HTMLSpanElement>,
    column: WorkTableColumn<T>,
  ) {
    if (drag.current?.id !== column.id) return;
    event.preventDefault();
    event.stopPropagation();
    const next = drag.current.width;
    drag.current = null;
    save(resizeTableColumn(preferences, columns, column.id, next));
    setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function resizeKey(
    event: KeyboardEvent<HTMLSpanElement>,
    column: WorkTableColumn<T>,
  ) {
    const bounds = columnWidthBounds(column);
    const delta = event.shiftKey ? 25 : 10;
    const next =
      event.key === "ArrowLeft"
        ? width(column) - delta
        : event.key === "ArrowRight"
          ? width(column) + delta
          : event.key === "Home"
            ? bounds.min
            : event.key === "End"
              ? bounds.max
              : null;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    save(resizeTableColumn(preferences, columns, column.id, next));
  }
  function stickyStyle(column: WorkTableColumn<T>): CSSProperties | undefined {
    return column.sticky
      ? { position: "sticky", left: sticky.get(column.id), zIndex: 2 }
      : undefined;
  }
  return (
    <section
      className={`work-table wt-${preferences.density} ${preview ? "wt-resizing" : ""}`}
      aria-label={ariaLabel}
    >
      <div className="wt-toolbar">
        <div className="wt-toolbar-leading">
          {toolbar ?? (
            <span>
              <strong>{rows.length}</strong> megjelenített sor
            </span>
          )}
        </div>
        <div className="wt-toolbar-actions">
          <div
            className="wt-density"
            role="group"
            aria-label="Táblázat sűrűsége"
          >
            <button
              type="button"
              aria-pressed={preferences.density === "compact"}
              onClick={() => save({ ...preferences, density: "compact" })}
              title="Kompakt sormagasság"
            >
              <span className="wt-density-icon compact" />
              Kompakt
            </button>
            <button
              type="button"
              aria-pressed={preferences.density === "comfortable"}
              onClick={() => save({ ...preferences, density: "comfortable" })}
              title="Kényelmes sormagasság"
            >
              <span className="wt-density-icon" />
              Kényelmes
            </button>
          </div>
          <button
            type="button"
            ref={settingsButton}
            className={`wt-settings-trigger ${settingsOpen ? "active" : ""}`}
            onClick={() => {
              setSettingsLocation(settingsPosition(settingsButton.current));
              setSettingsOpen((open) => !open);
            }}
            aria-expanded={settingsOpen}
            aria-controls={settingsId}
          >
            <Icon name="settings" size={15} />
            <span>Oszlopok</span>
            <b>
              {visible.length}/{columns.length}
            </b>
            <Icon name="down" size={12} />
          </button>
        </div>
        {settingsOpen
          ? createPortal(
              <div
                className="wt-settings"
                style={settingsLocation}
                id={settingsId}
                ref={settings}
                role="dialog"
                aria-label="Oszlopbeállítások"
              >
                <header>
                  <div>
                    <strong>A saját táblázatod</strong>
                    <p>Válaszd ki és rendezd az oszlopokat.</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Oszlopbeállítások bezárása"
                    onClick={() => {
                      setSettingsOpen(false);
                      settingsButton.current?.focus();
                    }}
                  >
                    <Icon name="close" size={17} />
                  </button>
                </header>
                <label className="wt-column-search">
                  <Icon name="search" size={15} />
                  <input
                    ref={settingsSearch}
                    value={columnSearch}
                    onChange={(event) => setColumnSearch(event.target.value)}
                    placeholder="Oszlop keresése…"
                    aria-label="Oszlop keresése"
                  />
                </label>
                <div className="wt-column-options">
                  {ordered
                    .filter((column) =>
                      column.label
                        .toLocaleLowerCase("hu-HU")
                        .includes(columnSearch.toLocaleLowerCase("hu-HU")),
                    )
                    .map((column) => {
                      const index = preferences.order.indexOf(column.id);
                      const shown = !preferences.hidden.includes(column.id);
                      return (
                        <div className="wt-column-option" key={column.id}>
                          <label>
                            <input
                              type="checkbox"
                              checked={shown}
                              disabled={shown && visible.length === 1}
                              onChange={() =>
                                save(toggleTableColumn(preferences, column.id))
                              }
                            />
                            <span>
                              {column.label}
                              {column.sticky ? (
                                <small>Rögzített oszlop</small>
                              ) : null}
                            </span>
                          </label>
                          <div>
                            <button
                              type="button"
                              disabled={index === 0}
                              aria-label={`${column.label} oszlop előrébb`}
                              onClick={() =>
                                save(
                                  moveTableColumn(preferences, column.id, -1),
                                )
                              }
                            >
                              <Icon
                                name="back"
                                size={13}
                                className="wt-move-up"
                              />
                            </button>
                            <button
                              type="button"
                              disabled={index === ordered.length - 1}
                              aria-label={`${column.label} oszlop hátrébb`}
                              onClick={() =>
                                save(moveTableColumn(preferences, column.id, 1))
                              }
                            >
                              <Icon
                                name="right"
                                size={13}
                                className="wt-move-down"
                              />
                            </button>
                            <span className="wt-column-width">
                              {preferences.widths[column.id]} px
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
                <footer>
                  <p>
                    <span className="wt-resize-mini" /> Az oszlopszéleket húzva
                    méretezheted.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      save(defaultTablePreferences(columns));
                      setColumnSearch("");
                    }}
                  >
                    <Icon name="refresh" size={13} />
                    Alapnézet visszaállítása
                  </button>
                </footer>
              </div>,
              document.body,
            )
          : null}
      </div>
      <div
        className="wt-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${ariaLabel} – vízszintesen görgethető táblázat`}
      >
        <table style={{ width: totalWidth }}>
          <caption className="wt-sr-only">
            {ariaLabel}. Az oszlopok szélessége húzással, illetve a méretezőn
            bal és jobb nyíllal változtatható.
          </caption>
          <colgroup>
            {selection ? <col style={{ width: 44 }} /> : null}
            {visible.map((column) => (
              <col key={column.id} style={{ width: width(column) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {selection ? (
                <th className="wt-selection wt-sticky-selection" scope="col">
                  <SelectionCheckbox
                    label="Az oldalon látható összes sor kijelölése"
                    checked={allSelected}
                    indeterminate={selectedVisible > 0 && !allSelected}
                    onChange={() => selection.onToggleAll(ids)}
                  />
                </th>
              ) : null}
              {visible.map((column) => {
                const active = Boolean(
                  column.sortKey && sort?.key === column.sortKey,
                );
                const bounds = columnWidthBounds(column);
                return (
                  <th
                    key={column.id}
                    className={`${column.sticky ? "wt-sticky-column" : ""} ${column.align ? `wt-align-${column.align}` : ""}`}
                    scope="col"
                    style={stickyStyle(column)}
                    aria-sort={
                      active
                        ? sort!.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {column.sortKey && sort ? (
                      <button
                        type="button"
                        className={`wt-sort ${active ? "active" : ""}`}
                        onClick={() => sort.onSort(column.sortKey!)}
                      >
                        <span>{column.label}</span>
                        <Icon
                          name="down"
                          size={12}
                          className={
                            active && sort.direction === "asc"
                              ? "ascending"
                              : ""
                          }
                        />
                      </button>
                    ) : (
                      <span className="wt-header-label">{column.label}</span>
                    )}
                    <span
                      className={`wt-resizer ${preview?.id === column.id ? "active" : ""}`}
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`${column.label} oszlopszélessége`}
                      aria-valuemin={bounds.min}
                      aria-valuemax={bounds.max}
                      aria-valuenow={width(column)}
                      aria-valuetext={`${width(column)} képpont`}
                      tabIndex={0}
                      onPointerDown={(event) => resizeStart(event, column)}
                      onPointerMove={(event) => resizeMove(event, column)}
                      onPointerUp={(event) => resizeEnd(event, column)}
                      onPointerCancel={() => {
                        drag.current = null;
                        setPreview(null);
                      }}
                      onLostPointerCapture={() => {
                        if (drag.current) {
                          drag.current = null;
                          setPreview(null);
                        }
                      }}
                      onKeyDown={(event) => resizeKey(event, column)}
                      onClick={(event) => event.stopPropagation()}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        save(
                          resizeTableColumn(
                            preferences,
                            columns,
                            column.id,
                            column.width,
                          ),
                        );
                      }}
                      title="Húzd a szélesség módosításához · dupla kattintás: alapméret"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const id = rowKey(row);
              const isSelected = selected.has(id);
              return (
                <tr
                  key={id}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={`${onRowClick ? "wt-clickable" : ""} ${isSelected ? "wt-selected" : ""}`}
                  aria-selected={selection ? isSelected : undefined}
                  onClick={(event) => {
                    if (
                      onRowClick &&
                      !interactive(event.target) &&
                      !window.getSelection()?.toString()
                    )
                      onRowClick(row);
                  }}
                  onKeyDown={(event) => {
                    if (
                      onRowClick &&
                      event.key === "Enter" &&
                      event.target === event.currentTarget
                    ) {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  }}
                >
                  {selection ? (
                    <td className="wt-selection wt-sticky-selection">
                      <SelectionCheckbox
                        checked={isSelected}
                        label={`${selection.label ?? "Sor"} ${index + 1}. kijelölése`}
                        onChange={() => selection.onToggle(id)}
                      />
                    </td>
                  ) : null}
                  {visible.map((column) => (
                    <td
                      key={column.id}
                      className={`${column.sticky ? "wt-sticky-column" : ""} ${column.align ? `wt-align-${column.align}` : ""}`}
                      style={stickyStyle(column)}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? (
          <div className="wt-empty">
            <span>
              <Icon name="search" size={22} />
            </span>
            <strong>{emptyTitle}</strong>
            <p>{emptyText}</p>
          </div>
        ) : null}
      </div>
      <div className="wt-footnote">
        <span>
          <i />
          Személyes nézet ehhez a felhasználóhoz és eszközhöz
        </span>
        <span>
          Oszlopszélek húzhatók<span aria-hidden="true"> · </span>Sor
          megnyitása: kattintás vagy Enter
        </span>
      </div>
    </section>
  );
}
