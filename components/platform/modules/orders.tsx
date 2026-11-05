"use client";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { useTms } from "../store";
import {
  statuses,
  freeCredit,
  money,
  number,
  orderRoute,
  uid,
  type Order,
  type CompanyId,
  type Currency,
  type SpecialRequirements,
  type CargoItem,
} from "../../../lib/tms/model";
import { validateOrder, assignmentError } from "../../../lib/tms/rules";
import { exportCsv, downloadFile } from "../../../lib/tms/files";
import { WorkTable, type WorkTableColumn } from "../ui/work-table";
import {
  emptyOrderFilters,
  filterOrderView,
  hasDocument,
  orderMargin,
  sortOrderView,
  type OrderFilters,
  type OrderView,
} from "../../../lib/tms/order-view";
import { StatusBadge, Modal, Field, Notice, Badge } from "../ui/primitives";
import { Icon } from "../ui/icon";

const requirementsDefault: SpecialRequirements = {
  sealNumber: "",
  adrUnNumber: "",
  instructions: "",
};

function OrderEditor({
  order,
  onCancel,
  onSaved,
}: {
  order: Order;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { state, companies, user, saveOrderAsync, isSaving } = useTms();
  const [draft, setDraft] = useState(() => structuredClone(order));
  const [baseline, setBaseline] = useState(() => JSON.stringify(order));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const operational =
    ["admin", "dispatcher"].includes(user.role) && order.status !== "Lezárva";
  const financial = user.role !== "viewer";
  const requirements = { ...requirementsDefault, ...draft.requirements };
  function patch(value: Partial<Order>) {
    setDraft((current) => ({ ...current, ...value }));
    setError("");
  }
  function requirement(value: Partial<SpecialRequirements>) {
    patch({ requirements: { ...requirements, ...value } });
  }
  function stopPatch(id: string, value: Partial<Order["stops"][number]>) {
    patch({
      stops: draft.stops.map((s) => (s.id === id ? { ...s, ...value } : s)),
    });
  }
  function itemPatch(stopId: string, id: string, value: Partial<CargoItem>) {
    const stop = draft.stops.find((s) => s.id === stopId)!;
    stopPatch(stopId, {
      cargoItems: stop.cargoItems?.map((item) =>
        item.id === id ? { ...item, ...value } : item,
      ),
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || isSaving) return;
    const current = state.orders.find((item) => item.id === order.id);
    if (!current || JSON.stringify(current) !== baseline) {
      setError(
        "A megbízás közben megváltozott. A szerkesztett adatok megmaradtak; ellenőrizd őket, vagy töltsd be az aktuális verziót.",
      );
      return;
    }
    const complete = {
      ...draft,
      reference: operational ? draft.reference.trim() : draft.reference,
    };
    const errors = validateOrder(state, complete);
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    const assignmentChanged =
      JSON.stringify(complete.stops) !== JSON.stringify(current.stops) ||
      JSON.stringify(complete.cargo) !== JSON.stringify(current.cargo);
    if (
      operational &&
      assignmentChanged &&
      complete.vehicleId &&
      !["Dokumentáció", "Lezárva"].includes(complete.status)
    ) {
      const assignment = assignmentError(state, complete, complete.vehicleId);
      if (assignment) {
        setError(assignment);
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      if (await saveOrderAsync(complete)) {
        setDraft(complete);
        setBaseline(JSON.stringify(complete));
        onSaved();
      } else
        setError(
          "A szerver nem fogadta el a mentést. Az adatok szerkeszthetők maradtak; az értesítésben látható az ok.",
        );
    } finally {
      setBusy(false);
    }
  }
  function reload() {
    const current = state.orders.find((item) => item.id === order.id);
    if (current) {
      setDraft(structuredClone(current));
      setBaseline(JSON.stringify(current));
      setError("");
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="modal-body stack">
        <Notice>
          {operational
            ? "A módosítás újraellenőrzi a hitelkeretet, a rakodási adatokat és a meglévő erőforrás-kiosztást. A státusz külön műveletben változtatható."
            : "Ebben az állapotban és szerepkörben a terv- és tényköltség módosítható. A fuvar operatív adatai csak olvashatók."}
        </Notice>
        <fieldset
          disabled={!operational || busy || isSaving}
          className="order-edit-fieldset"
        >
          <h3 className="section-label">Megbízás és felelősök</h3>
          <div className="form-grid">
            <Field label="Megbízásszám *">
              <input
                required
                maxLength={120}
                value={draft.reference}
                onChange={(e) => patch({ reference: e.target.value })}
              />
            </Field>
            <Field label="Megbízó partner">
              <select
                value={draft.partnerId}
                onChange={(e) =>
                  patch({
                    partnerId: e.target.value,
                    contact:
                      state.partners.find((p) => p.id === e.target.value)
                        ?.contact || "",
                  })
                }
              >
                {state.partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kapcsolattartó">
              <input
                value={draft.contact}
                onChange={(e) => patch({ contact: e.target.value })}
              />
            </Field>
            <Field label="Fuvarszervező">
              <input
                value={draft.dispatcher}
                onChange={(e) => patch({ dispatcher: e.target.value })}
              />
            </Field>
            <Field label="Saját cég">
              <select
                value={draft.companyId}
                onChange={(e) =>
                  patch({ companyId: e.target.value as CompanyId })
                }
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Üzletág">
              <input
                value={draft.division}
                onChange={(e) => patch({ division: e.target.value })}
              />
            </Field>
            <Field label="Fuvar típusa">
              <select
                value={draft.type}
                onChange={(e) => patch({ type: e.target.value })}
              >
                {["Belföld", "Export", "Import", "Körfuvar"].map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </Field>
          </div>
          <h3 className="section-label">Rakodási terv</h3>
          <div className="editable-stops">
            {draft.stops.map((stop, index) => (
              <div className="stop-editor" key={stop.id}>
                <div className="stop-editor-head">
                  <b>{index + 1}</b>
                  <select
                    aria-label={`${index + 1}. megálló típusa`}
                    value={stop.type}
                    onChange={(e) =>
                      stopPatch(stop.id, {
                        type: e.target.value as "Felrakó" | "Lerakó",
                      })
                    }
                  >
                    <option>Felrakó</option>
                    <option>Lerakó</option>
                  </select>
                  {draft.stops.length > 2 ? (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`${index + 1}. megálló törlése`}
                      onClick={() =>
                        patch({
                          stops: draft.stops.filter((s) => s.id !== stop.id),
                        })
                      }
                    >
                      <Icon name="close" size={14} />
                    </button>
                  ) : null}
                </div>
                <div className="form-grid">
                  {(["city", "address", "date", "time"] as const).map(
                    (key, i) => (
                      <Field
                        key={key}
                        label={["Város *", "Cím *", "Dátum *", "Időpont *"][i]}
                      >
                        <input
                          required
                          type={key === "date" || key === "time" ? key : "text"}
                          value={stop[key]}
                          onChange={(e) =>
                            stopPatch(stop.id, { [key]: e.target.value })
                          }
                        />
                      </Field>
                    ),
                  )}
                </div>
                {stop.cargoItems?.map((item) => (
                  <div className="intake-cargo-item" key={item.id}>
                    <strong>Rakománytétel</strong>
                    <div className="form-grid">
                      {(
                        [
                          "name",
                          "kg",
                          "pieces",
                          "ldm",
                          "lengthCm",
                          "widthCm",
                          "heightCm",
                        ] as const
                      ).map((key, i) => (
                        <Field
                          key={key}
                          label={
                            [
                              "Megnevezés",
                              "Tömeg (kg)",
                              "Darabszám",
                              "LDM",
                              "Hossz (cm)",
                              "Szélesség (cm)",
                              "Magasság (cm)",
                            ][i]
                          }
                        >
                          <input
                            type={key === "name" ? "text" : "number"}
                            min="0"
                            step={key === "pieces" ? "1" : "any"}
                            value={item[key] ?? ""}
                            onChange={(e) =>
                              itemPatch(stop.id, item.id, {
                                [key]:
                                  key === "name"
                                    ? e.target.value
                                    : e.target.value === "" &&
                                        key.endsWith("Cm")
                                      ? undefined
                                      : Number(e.target.value),
                              })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="button small"
            onClick={() =>
              patch({
                stops: [
                  ...draft.stops,
                  {
                    id: uid(),
                    type: "Lerakó",
                    city: "",
                    address: "",
                    date: draft.stops.at(-1)?.date || "",
                    time: "16:00",
                  },
                ],
              })
            }
          >
            <Icon name="plus" size={14} /> Új megálló
          </button>
          <h3 className="section-label">Rakomány</h3>
          <div className="form-grid">
            {(["name", "kg", "pieces", "ldm"] as const).map((key, i) => (
              <Field
                key={key}
                label={
                  [
                    "Áru megnevezése *",
                    "Összes tömeg (kg) *",
                    "Összes darabszám *",
                    "LDM",
                  ][i]
                }
              >
                <input
                  required
                  type={key === "name" ? "text" : "number"}
                  min="0"
                  step={key === "pieces" ? "1" : "any"}
                  value={draft.cargo[key]}
                  onChange={(e) =>
                    patch({
                      cargo: {
                        ...draft.cargo,
                        [key]:
                          key === "name"
                            ? e.target.value
                            : Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
            ))}
            <Field label="Rakománytípus">
              <select
                value={draft.cargo.type}
                onChange={(e) =>
                  patch({ cargo: { ...draft.cargo, type: e.target.value } })
                }
              >
                {[
                  "Ponyvás",
                  "Tartályos",
                  "Silós",
                  "Billencs",
                  "Konténer",
                  "Cement",
                  "Túlméretes",
                ].map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </Field>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.cargo.adr}
                onChange={(e) =>
                  patch({
                    cargo: { ...draft.cargo, adr: e.target.checked },
                    requirements: e.target.checked
                      ? requirements
                      : { ...requirements, adrUnNumber: "" },
                  })
                }
              />{" "}
              ADR veszélyes áru
            </label>
          </div>
          <h3 className="section-label">Különleges követelmények</h3>
          <div className="form-grid">
            <Field label="Plombaszám">
              <input
                value={requirements.sealNumber}
                onChange={(e) => requirement({ sealNumber: e.target.value })}
              />
            </Field>
            <Field label="ADR UN-szám">
              <input
                disabled={!draft.cargo.adr}
                maxLength={4}
                value={requirements.adrUnNumber}
                onChange={(e) => requirement({ adrUnNumber: e.target.value })}
              />
            </Field>
            <Field label="Minimum hőmérséklet (°C)">
              <input
                type="number"
                step="any"
                value={requirements.temperatureMin ?? ""}
                onChange={(e) =>
                  requirement({
                    temperatureMin:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Maximum hőmérséklet (°C)">
              <input
                type="number"
                step="any"
                value={requirements.temperatureMax ?? ""}
                onChange={(e) =>
                  requirement({
                    temperatureMax:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <Field label="Rakodási utasítás / ADR dokumentáció">
            <textarea
              value={requirements.instructions}
              onChange={(e) => requirement({ instructions: e.target.value })}
            />
          </Field>
          <Field label="Megjegyzés">
            <textarea
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </Field>
          <h3 className="section-label">Út és fuvardíj</h3>
          <div className="form-grid">
            {(["loadedKm", "emptyKm", "price"] as const).map((key, i) => (
              <Field
                key={key}
                label={["Rakott km", "Üres km", "Nettó fuvardíj *"][i]}
              >
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={draft[key]}
                  onChange={(e) => patch({ [key]: Number(e.target.value) })}
                />
              </Field>
            ))}
            <Field label="Deviza">
              <select
                value={draft.currency}
                onChange={(e) =>
                  patch({ currency: e.target.value as Currency })
                }
              >
                <option>HUF</option>
                <option>EUR</option>
              </select>
            </Field>
          </div>
          <p className="muted spaced">
            Szabad hitelkeret a fuvar saját foglalása nélkül:{" "}
            {money(freeCredit(state, draft.partnerId, draft.id))} · tervezési
            árfolyam: 400 HUF/EUR.
          </p>
        </fieldset>
        <fieldset
          disabled={!financial || busy || isSaving}
          className="order-edit-fieldset"
        >
          <h3 className="section-label">Költségek</h3>
          <div className="form-grid">
            <Field label="Tervköltség (HUF)">
              <input
                type="number"
                min="0"
                step="any"
                value={draft.plannedCost}
                onChange={(e) => patch({ plannedCost: Number(e.target.value) })}
              />
            </Field>
            <Field label="Tényköltség (HUF)">
              <input
                type="number"
                min="0"
                step="any"
                value={draft.actualCost}
                onChange={(e) => patch({ actualCost: Number(e.target.value) })}
              />
            </Field>
          </div>
        </fieldset>
        {error ? (
          <div className="error-message" role="alert">
            <Icon name="alert" size={17} />
            {error}
          </div>
        ) : null}
      </div>
      <footer className="modal-actions">
        <button
          type="button"
          className="button"
          disabled={busy || isSaving}
          onClick={onCancel}
        >
          Mégse
        </button>
        <button
          type="button"
          className="text-link"
          disabled={busy || isSaving}
          onClick={reload}
        >
          Aktuális verzió betöltése
        </button>
        <button
          className="button primary"
          disabled={!financial || busy || isSaving}
        >
          {busy ? "Mentés…" : "Módosítások mentése"}
          <Icon name="check" size={16} />
        </button>
      </footer>
    </form>
  );
}

export default function Orders() {
  const {
    state,
    companies,
    orders,
    user,
    saveOrderAsync,
    transition,
    assign,
    notify,
    isSaving,
    refresh,
    lastSynced,
  } = useTms();
  const [view, setView] = useState<OrderView>("unassigned");
  const [filters, setFilters] = useState<OrderFilters>({
    ...emptyOrderFilters,
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>({
    key: "createdAt",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const queryOrder = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("order"),
    () => null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [editing, setEditing] = useState(true);
  const [vehicleChoice, setVehicleChoice] = useState<{
    orderId: string;
    id: string;
  } | null>(null);
  const order = orders.find(
    (item) => item.id === (selected || (!dismissed ? queryOrder : null)),
  );
  const selectedVehicle =
    order &&
    (vehicleChoice?.orderId === order.id ? vehicleChoice.id : order.vehicleId);
  const canOperate = ["admin", "dispatcher"].includes(user.role);
  const canReassign = Boolean(
    order &&
      canOperate &&
      ["Új", "Tervezett", "Kiosztva"].includes(order.status),
  );
  const visible = useMemo(
    () =>
      sortOrderView(
        filterOrderView(orders, state, view, filters),
        sort.key,
        sort.direction,
      ),
    [orders, state, view, filters, sort],
  );
  const selectedRows = visible.filter((item) => checkedIds.includes(item.id));
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visible.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const counts = {
    unassigned: orders.filter((item) => !item.vehicleId).length,
    assigned: orders.filter((item) => Boolean(item.vehicleId)).length,
    all: orders.length,
  };
  const totals = visible.reduce(
    (total, item) => {
      const margin = orderMargin(item);
      total.revenue += margin.revenue;
      total.margin += margin.amount;
      return total;
    },
    { revenue: 0, margin: 0 },
  );
  const inProgress = visible.filter((item) =>
    ["Felrakodás", "Úton", "Lerakodás"].includes(item.status),
  ).length;
  const missingDocuments = visible.filter(
    (item) =>
      ["Dokumentáció", "Lezárva"].includes(item.status) &&
      !hasDocument(state, item.id, "CMR"),
  ).length;
  const dispatchers = Array.from(
    new Set(orders.map((item) => item.dispatcher).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "hu"));
  const cargoTypes = Array.from(
    new Set(orders.map((item) => item.cargo.type).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "hu"));
  function patchFilters(patch: Partial<OrderFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
    setCheckedIds([]);
  }
  function changeView(next: OrderView) {
    setView(next);
    setPage(1);
    setCheckedIds([]);
  }
  function clearFilters() {
    setFilters({ ...emptyOrderFilters });
    setPage(1);
    setCheckedIds([]);
  }
  function open(id: string) {
    setSelected(id);
    setEditing(true);
    setVehicleChoice(null);
  }
  function close() {
    if (isSaving) return;
    setSelected(null);
    setDismissed(true);
    setEditing(true);
    setVehicleChoice(null);
  }
  async function copy(source: Order) {
    const clone = {
      ...structuredClone(source),
      id: uid(),
      reference: `${source.reference}-MÁSOLAT-${Date.now().toString().slice(-6)}`,
      status: "Új" as const,
      vehicleId: "",
      driverId: "",
      trailer: "",
      actualCost: 0,
      createdAt: new Date().toISOString(),
      createdBy: user.name,
      batchId: undefined,
    };
    await saveOrderAsync(clone);
  }
  function toggleRow(id: string) {
    setCheckedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  function togglePage(ids: string[]) {
    setCheckedIds((current) =>
      ids.every((id) => current.includes(id))
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])],
    );
  }
  function exportList() {
    const list = selectedRows.length ? selectedRows : visible;
    exportCsv("tessTMS-fuvarlista.csv", [
      [
        "Fuvarszám",
        "Partner",
        "Saját cég",
        "Felrakó",
        "Felrakás dátuma",
        "Lerakó",
        "Lerakás dátuma",
        "Rakomány",
        "Kg",
        "LDM",
        "Kamion",
        "Sofőr",
        "Pótkocsi",
        "Fuvardíj",
        "Deviza",
        "Fedezet (HUF)",
        "Státusz",
        "Fuvarszervező",
      ],
      ...list.map((item) => [
        item.reference,
        state.partners.find((partner) => partner.id === item.partnerId)?.name ||
          "",
        companies.find((company) => company.id === item.companyId)?.name || "",
        item.stops[0]?.city || "",
        item.stops[0]?.date || "",
        item.stops.at(-1)?.city || "",
        item.stops.at(-1)?.date || "",
        item.cargo.name,
        item.cargo.kg,
        item.cargo.ldm,
        state.vehicles.find((vehicle) => vehicle.id === item.vehicleId)
          ?.plate || "",
        state.drivers.find((driver) => driver.id === item.driverId)?.name || "",
        item.trailer,
        item.price,
        item.currency,
        orderMargin(item).amount,
        item.status,
        item.dispatcher,
      ]),
    ]);
  }
  const chips: { key: keyof OrderFilters; label: string }[] = [];
  if (filters.search)
    chips.push({ key: "search", label: `Keresés: ${filters.search}` });
  if (filters.dateFrom || filters.dateTo)
    chips.push({
      key: "dateFrom",
      label: `${filters.dateField === "pickup" ? "Felrakás" : filters.dateField === "delivery" ? "Lerakás" : "Rögzítés"}: ${filters.dateFrom || "…"} – ${filters.dateTo || "…"}`,
    });
  if (filters.statuses.length)
    chips.push({
      key: "statuses",
      label: `Státusz: ${filters.statuses.join(", ")}`,
    });
  if (filters.partnerId)
    chips.push({
      key: "partnerId",
      label:
        state.partners.find((partner) => partner.id === filters.partnerId)
          ?.name || "Partner",
    });
  if (filters.dispatcher)
    chips.push({ key: "dispatcher", label: filters.dispatcher });
  if (filters.from)
    chips.push({ key: "from", label: `Felrakó: ${filters.from}` });
  if (filters.to) chips.push({ key: "to", label: `Lerakó: ${filters.to}` });
  if (filters.cargoType)
    chips.push({ key: "cargoType", label: filters.cargoType });
  if (filters.adr !== "all")
    chips.push({
      key: "adr",
      label: filters.adr === "yes" ? "ADR rakomány" : "Nem ADR",
    });
  if (filters.vehicleId)
    chips.push({
      key: "vehicleId",
      label:
        state.vehicles.find((vehicle) => vehicle.id === filters.vehicleId)
          ?.plate || "Jármű",
    });
  if (filters.driverId)
    chips.push({
      key: "driverId",
      label:
        state.drivers.find((driver) => driver.id === filters.driverId)?.name ||
        "Sofőr",
    });
  if (filters.priceMin || filters.priceMax)
    chips.push({
      key: "priceMin",
      label: `Díj: ${filters.priceMin || "0"} – ${filters.priceMax || "∞"} Ft`,
    });
  if (filters.currency !== "all")
    chips.push({ key: "currency", label: filters.currency });
  if (filters.documents !== "all")
    chips.push({
      key: "documents",
      label:
        filters.documents === "missing-order"
          ? "Hiányzó megbízás"
          : filters.documents === "missing-cmr"
            ? "Hiányzó CMR"
            : "Teljes dokumentáció",
    });
  if (filters.margin !== "all")
    chips.push({
      key: "margin",
      label:
        filters.margin === "negative"
          ? "Negatív fedezet"
          : "15% alatti fedezet",
    });
  function removeChip(key: keyof OrderFilters) {
    if (key === "dateFrom") patchFilters({ dateFrom: "", dateTo: "" });
    else if (key === "priceMin") patchFilters({ priceMin: "", priceMax: "" });
    else patchFilters({ [key]: emptyOrderFilters[key] });
  }
  function stopCell(item: Order, type: "Felrakó" | "Lerakó") {
    const stop =
      type === "Felrakó"
        ? item.stops.find((point) => point.type === type)
        : item.stops.filter((point) => point.type === type).at(-1);
    if (!stop)
      return <span className="orders-ws-cell-muted">Nincs megadva</span>;
    return (
      <div
        className={`orders-ws-location ${type === "Felrakó" ? "pickup" : "delivery"}`}
      >
        <span className="orders-ws-route-dot" />
        <div>
          <strong>{stop.city}</strong>
          <small>
            {new Date(`${stop.date}T12:00:00Z`).toLocaleDateString("hu-HU", {
              month: "short",
              day: "numeric",
            })}{" "}
            · {stop.time}
          </small>
        </div>
      </div>
    );
  }
  const columns: WorkTableColumn<Order>[] = [
    {
      id: "reference",
      label: "Fuvar / megbízó",
      width: 180,
      minWidth: 150,
      sortKey: "reference",
      sticky: true,
      render: (item) => (
        <div className="orders-ws-reference">
          <button onClick={() => open(item.id)}>{item.reference}</button>
          <small
            title={
              state.partners.find((partner) => partner.id === item.partnerId)
                ?.name
            }
          >
            {state.partners.find((partner) => partner.id === item.partnerId)
              ?.name || "Ismeretlen partner"}
          </small>
        </div>
      ),
    },
    {
      id: "pickup",
      label: "Felrakó / időpont",
      width: 130,
      minWidth: 120,
      sortKey: "pickup",
      render: (item) => stopCell(item, "Felrakó"),
    },
    {
      id: "delivery",
      label: "Lerakó / időpont",
      width: 130,
      minWidth: 120,
      sortKey: "delivery",
      render: (item) => stopCell(item, "Lerakó"),
    },
    {
      id: "cargo",
      label: "Rakomány",
      width: 112,
      minWidth: 100,
      render: (item) => (
        <div className="orders-ws-cargo">
          <strong>{number(item.cargo.kg)} kg</strong>
          <small>
            {item.cargo.ldm} LDM · {item.cargo.type}
          </small>
          {item.cargo.adr ? <span className="orders-ws-adr">ADR</span> : null}
        </div>
      ),
    },
    {
      id: "resource",
      label: "Kamion / sofőr",
      width: 168,
      minWidth: 125,
      defaultHidden: view === "unassigned",
      render: (item) => (
        <div className="orders-ws-resource">
          <strong>
            {state.vehicles.find((vehicle) => vehicle.id === item.vehicleId)
              ?.plate || "Kiosztásra vár"}
          </strong>
          <small>
            {state.drivers.find((driver) => driver.id === item.driverId)
              ?.name || "Nincs erőforrás"}
          </small>
        </div>
      ),
    },
    {
      id: "price",
      label: "Fuvardíj",
      width: 110,
      minWidth: 100,
      sortKey: "price",
      render: (item) => (
        <strong className="orders-ws-money">
          {money(item.price, item.currency)}
        </strong>
      ),
    },
    {
      id: "margin",
      label: "Fedezet",
      width: 90,
      minWidth: 90,
      sortKey: "margin",
      render: (item) => {
        const margin = orderMargin(item);
        return (
          <div
            className={`orders-ws-margin ${margin.amount < 0 ? "negative" : ""}`}
          >
            <strong>{margin.percentage.toFixed(1)}%</strong>
            <small>{money(margin.amount)}</small>
          </div>
        );
      },
    },
    {
      id: "status",
      label: "Státusz",
      width: 110,
      minWidth: 105,
      sortKey: "status",
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      id: "company",
      label: "Saját cég",
      width: 185,
      defaultHidden: true,
      render: (item) =>
        companies.find((company) => company.id === item.companyId)?.name || "—",
    },
    {
      id: "dispatcher",
      label: "Fuvarszervező",
      width: 160,
      defaultHidden: true,
      render: (item) => item.dispatcher,
    },
    {
      id: "contact",
      label: "Kapcsolattartó",
      width: 155,
      defaultHidden: true,
      render: (item) => item.contact || "—",
    },
    {
      id: "division",
      label: "Üzletág",
      width: 120,
      defaultHidden: true,
      render: (item) => item.division,
    },
    {
      id: "type",
      label: "Fuvar típusa",
      width: 120,
      defaultHidden: true,
      render: (item) => item.type,
    },
    {
      id: "cargoName",
      label: "Áru megnevezése",
      width: 210,
      defaultHidden: true,
      render: (item) => item.cargo.name,
    },
    {
      id: "pieces",
      label: "Darabszám",
      width: 100,
      defaultHidden: true,
      render: (item) => `${number(item.cargo.pieces)} db`,
    },
    {
      id: "trailer",
      label: "Pótkocsi",
      width: 120,
      defaultHidden: true,
      render: (item) => item.trailer || "—",
    },
    {
      id: "loadedKm",
      label: "Rakott km",
      width: 110,
      defaultHidden: true,
      render: (item) => `${number(item.loadedKm)} km`,
    },
    {
      id: "emptyKm",
      label: "Üres km",
      width: 105,
      defaultHidden: true,
      render: (item) => `${number(item.emptyKm)} km`,
    },
    {
      id: "plannedCost",
      label: "Tervköltség",
      width: 140,
      defaultHidden: true,
      render: (item) => money(item.plannedCost),
    },
    {
      id: "actualCost",
      label: "Tényköltség",
      width: 140,
      defaultHidden: true,
      render: (item) => money(item.actualCost),
    },
    {
      id: "documents",
      label: "Dokumentáció",
      width: 155,
      defaultHidden: true,
      render: (item) => (
        <div className="orders-ws-document-state">
          <span
            className={
              hasDocument(state, item.id, "Megbízás") ? "complete" : ""
            }
          >
            Megbízás
          </span>
          <span
            className={hasDocument(state, item.id, "CMR") ? "complete" : ""}
          >
            CMR
          </span>
        </div>
      ),
    },
    {
      id: "createdAt",
      label: "Rögzítve",
      width: 145,
      defaultHidden: true,
      sortKey: "createdAt",
      render: (item) =>
        new Date(item.createdAt).toLocaleDateString("hu-HU", {
          timeZone: "Europe/Budapest",
        }),
    },
    {
      id: "createdBy",
      label: "Rögzítette",
      width: 165,
      defaultHidden: true,
      render: (item) => item.createdBy || "—",
    },
    {
      id: "notes",
      label: "Megjegyzés",
      width: 240,
      defaultHidden: true,
      render: (item) => <span title={item.notes}>{item.notes || "—"}</span>,
    },
    {
      id: "actions",
      label: "Megnyitás",
      defaultHidden: true,
      width: 64,
      minWidth: 56,
      render: (item) => (
        <button
          className="orders-ws-open-row"
          aria-label={`${item.reference} szerkesztése`}
          title="Fuvar megnyitása"
          onClick={() => open(item.id)}
        >
          <Icon name="arrow" size={17} />
        </button>
      ),
    },
  ];
  const selectFilter = (
    label: string,
    key: keyof OrderFilters,
    items: { value: string; label: string }[],
    allLabel = "Mind",
  ) => (
    <label className="orders-ws-field">
      <span>{label}</span>
      <select
        value={String(filters[key])}
        onChange={(event) => patchFilters({ [key]: event.target.value })}
      >
        <option
          value="all"
          hidden={!["currency", "adr", "documents", "margin"].includes(key)}
        >
          {allLabel}
        </option>
        {!["currency", "adr", "documents", "margin"].includes(key) ? (
          <option value="">{allLabel}</option>
        ) : null}
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className={`orders-ws ${filterOpen ? "filters-open" : ""}`}>
      <header className="orders-ws-heading">
        <div>
          <div className="orders-ws-eyebrow">
            <Icon name="orders" size={14} /> FUVARMENEDZSMENT
          </div>
          <h1>
            Fuvarok<span>{orders.length}</span>
          </h1>
          <p>A megbízások teljes operatív és pénzügyi képe.</p>
        </div>
        <div className="orders-ws-heading-actions">
          <button
            className="button"
            aria-label="Fuvarlista frissítése"
            disabled={refreshing || isSaving}
            onClick={async () => {
              setRefreshing(true);
              try {
                await refresh();
                notify("A fuvarállomány frissült.");
              } catch (error) {
                notify(
                  error instanceof Error ? error.message : "Frissítési hiba.",
                  true,
                );
              } finally {
                setRefreshing(false);
              }
            }}
          >
            <Icon name="refresh" size={15} />
            <span>{refreshing ? "Frissítés…" : "Frissítés"}</span>
          </button>
          <button
            className="button"
            onClick={exportList}
            disabled={!visible.length}
          >
            <Icon name="download" size={15} />
            {selectedRows.length
              ? `Kijelöltek exportja (${selectedRows.length})`
              : "Exportálás"}
          </button>
          {canOperate ? (
            <Link className="button primary" href="/new-order">
              <Icon name="plus" size={17} />
              Új fuvarmegbízás
            </Link>
          ) : null}
        </div>
      </header>
      <div className="orders-ws-viewbar">
        <div
          className="orders-ws-tabs"
          role="tablist"
          aria-label="Fuvarok kiosztási nézete"
        >
          {(
            [
              ["unassigned", "Kiosztatlan fuvarok", "orders"],
              ["assigned", "Kiosztott fuvarok", "truck"],
              ["all", "Összes fuvar", "folder"],
            ] as const
          ).map(([value, label, icon]) => (
            <button
              key={value}
              role="tab"
              aria-selected={view === value}
              className={view === value ? "active" : ""}
              onClick={() => changeView(value)}
            >
              <Icon name={icon} size={16} />
              {label}
              <span>{counts[value]}</span>
            </button>
          ))}
        </div>
        <span className="orders-ws-sync">
          <i /> Frissítve{" "}
          {new Date(lastSynced).toLocaleTimeString("hu-HU", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Budapest",
          })}
        </span>
      </div>
      <div className="orders-ws-metrics">
        <article>
          <span className="orders-ws-metric-icon">
            <Icon name="orders" size={19} />
          </span>
          <div>
            <span>Fuvar a nézetben</span>
            <strong>{visible.length}</strong>
            <small>
              {view === "unassigned"
                ? "Erőforrás hozzárendelésére vár"
                : view === "assigned"
                  ? "Járműhöz rendelt megbízás"
                  : "A szűrésnek megfelelő állomány"}
            </small>
          </div>
        </article>
        <article>
          <span className="orders-ws-metric-icon blue">
            <Icon name="truck" size={19} />
          </span>
          <div>
            <span>Folyamatban</span>
            <strong>{inProgress}</strong>
            <small>Felrakodás, szállítás és lerakodás</small>
          </div>
        </article>
        <article className={missingDocuments ? "attention" : ""}>
          <span className="orders-ws-metric-icon amber">
            <Icon name="folder" size={19} />
          </span>
          <div>
            <span>Dokumentumhiány</span>
            <strong>{missingDocuments}</strong>
            <small>Hiányzó CMR a teljesítési szakaszban</small>
          </div>
        </article>
        <article>
          <span className="orders-ws-metric-icon mint">
            <Icon name="finance" size={19} />
          </span>
          <div>
            <span>Állomány fedezete</span>
            <strong className={totals.margin < 0 ? "negative" : ""}>
              {money(totals.margin)}
            </strong>
            <small>
              {totals.revenue
                ? ((totals.margin / totals.revenue) * 100).toFixed(1)
                : "0"}
              % árbevétel-arányos fedezet
            </small>
          </div>
        </article>
      </div>
      <section className="orders-ws-main" aria-label="Fuvar munkalista">
        <div className="orders-ws-list">
          <div className="orders-ws-filterbar">
            <div className="orders-ws-search">
              <Icon name="search" size={17} />
              <input
                value={filters.search}
                onChange={(event) =>
                  patchFilters({ search: event.target.value })
                }
                placeholder="Fuvarszám, megbízó, település vagy rendszám…"
                aria-label="Fuvarok keresése"
              />
              {filters.search ? (
                <button
                  aria-label="Keresés törlése"
                  onClick={() => patchFilters({ search: "" })}
                >
                  <Icon name="close" size={14} />
                </button>
              ) : null}
            </div>
            <button
              className={`orders-ws-filter-toggle ${filterOpen ? "active" : ""}`}
              aria-expanded={filterOpen}
              aria-controls="orders-advanced-filters"
              onClick={() => setFilterOpen((value) => !value)}
            >
              <Icon name="settings" size={16} />
              Részletes szűrők{chips.length ? <b>{chips.length}</b> : null}
            </button>
          </div>
          <div className="orders-ws-quick-filters">
            <label>
              <span>Dátum alapja</span>
              <select
                value={filters.dateField}
                onChange={(event) =>
                  patchFilters({
                    dateField: event.target.value as OrderFilters["dateField"],
                  })
                }
              >
                <option value="pickup">Felrakás</option>
                <option value="delivery">Lerakás</option>
                <option value="created">Rögzítés</option>
              </select>
            </label>
            <label>
              <span>Dátumtól</span>
              <input
                aria-label="Fuvar dátumtól"
                type="date"
                value={filters.dateFrom}
                onChange={(event) =>
                  patchFilters({ dateFrom: event.target.value })
                }
              />
            </label>
            <label>
              <span>Dátumig</span>
              <input
                aria-label="Fuvar dátumig"
                type="date"
                value={filters.dateTo}
                onChange={(event) =>
                  patchFilters({ dateTo: event.target.value })
                }
              />
            </label>
            <label className="orders-ws-partner-filter">
              <span>Megbízó</span>
              <select
                value={filters.partnerId}
                onChange={(event) =>
                  patchFilters({ partnerId: event.target.value })
                }
              >
                <option value="">Minden megbízó</option>
                {state.partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Státusz</span>
              <select
                value={filters.statuses.length === 1 ? filters.statuses[0] : ""}
                onChange={(event) =>
                  patchFilters({
                    statuses: event.target.value ? [event.target.value] : [],
                  })
                }
              >
                <option value="">
                  {filters.statuses.length > 1
                    ? `${filters.statuses.length} státusz kiválasztva`
                    : "Minden státusz"}
                </option>
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>
          {chips.length ? (
            <div className="orders-ws-chips">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => removeChip(chip.key)}
                  title="Szűrő eltávolítása"
                >
                  {chip.label}
                  <Icon name="close" size={12} />
                </button>
              ))}
              <button className="orders-ws-clear" onClick={clearFilters}>
                Összes törlése
              </button>
            </div>
          ) : null}
          {filters.dateFrom &&
          filters.dateTo &&
          filters.dateFrom > filters.dateTo ? (
            <div className="orders-ws-filter-error" role="alert">
              A záró dátum nem előzheti meg a kezdő dátumot.
            </div>
          ) : null}
          <WorkTable
            columns={columns}
            rows={pageRows}
            rowKey={(item) => item.id}
            onRowClick={(item) => open(item.id)}
            storageKey={`tessTMS.orders.columns.v2:${user.workspaceId}:${user.id}:${view}`}
            selection={{
              selectedIds: checkedIds,
              onToggle: toggleRow,
              onToggleAll: togglePage,
              label: "Fuvarok kijelölése",
            }}
            sort={{
              ...sort,
              onSort: (key) =>
                setSort((current) => ({
                  key,
                  direction:
                    current.key === key && current.direction === "asc"
                      ? "desc"
                      : "asc",
                })),
            }}
            toolbar={
              <div className="orders-ws-result-count">
                <strong>{visible.length}</strong> találat
                {selectedRows.length ? (
                  <>
                    <span>·</span>
                    <b>{selectedRows.length} kijelölve</b>
                    <button onClick={() => setCheckedIds([])}>
                      Kijelölés törlése
                    </button>
                  </>
                ) : null}
              </div>
            }
            emptyTitle="Nincs a szűrésnek megfelelő fuvar."
            emptyText="Módosítsd a feltételeket, vagy indíts új fuvarmegbízást."
            ariaLabel="Személyre szabható fuvarlista"
          />
          <footer className="orders-ws-pagination">
            <span>
              {visible.length
                ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, visible.length)}`
                : "0"}{" "}
              / {visible.length} fuvar
            </span>
            <div className="orders-ws-page-buttons">
              <button
                aria-label="Előző oldal"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <Icon name="back" size={14} />
              </button>
              <span>
                <strong>{currentPage}</strong> / {totalPages}
              </span>
              <button
                aria-label="Következő oldal"
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                <Icon name="right" size={14} />
              </button>
            </div>
            <label>
              Oldalméret
              <select
                aria-label="Fuvarlista oldalmérete"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </footer>
          <div className="orders-ws-table-note">
            <Icon name="shield" size={13} />
            Az oszlopok sorrendje, láthatósága és szélessége a saját nézetedhez
            mentődik.
            <span>HUF egyenérték · 400 HUF/EUR tervezési árfolyam</span>
          </div>
        </div>
        {filterOpen ? (
          <aside className="orders-ws-filters" id="orders-advanced-filters">
            <header>
              <div>
                <Icon name="settings" size={16} />
                <h2>Részletes szűrők</h2>
              </div>
              <button
                aria-label="Részletes szűrők bezárása"
                onClick={() => setFilterOpen(false)}
              >
                <Icon name="close" size={17} />
              </button>
            </header>
            <div className="orders-ws-filter-section">
              <h3>Állapot és felelős</h3>
              <div className="orders-ws-status-options">
                {statuses.map((status) => (
                  <label key={status}>
                    <input
                      type="checkbox"
                      checked={filters.statuses.includes(status)}
                      onChange={(event) =>
                        patchFilters({
                          statuses: event.target.checked
                            ? [...filters.statuses, status]
                            : filters.statuses.filter(
                                (item) => item !== status,
                              ),
                        })
                      }
                    />
                    <span>{status}</span>
                  </label>
                ))}
              </div>
              {selectFilter(
                "Fuvarszervező",
                "dispatcher",
                dispatchers.map((value) => ({ value, label: value })),
                "Minden fuvarszervező",
              )}
            </div>
            <div className="orders-ws-filter-section">
              <h3>Viszonylat és rakomány</h3>
              <label className="orders-ws-field">
                <span>Felrakó település / cím</span>
                <input
                  value={filters.from}
                  onChange={(event) =>
                    patchFilters({ from: event.target.value })
                  }
                  placeholder="Pl. Győr"
                />
              </label>
              <label className="orders-ws-field">
                <span>Lerakó település / cím</span>
                <input
                  value={filters.to}
                  onChange={(event) => patchFilters({ to: event.target.value })}
                  placeholder="Pl. Budapest"
                />
              </label>
              {selectFilter(
                "Rakománytípus",
                "cargoType",
                cargoTypes.map((value) => ({ value, label: value })),
                "Minden rakomány",
              )}
              {selectFilter(
                "ADR követelmény",
                "adr",
                [
                  { value: "yes", label: "ADR veszélyes áru" },
                  { value: "no", label: "Nem ADR" },
                ],
                "Mind",
              )}
            </div>
            <div className="orders-ws-filter-section">
              <h3>Erőforrások</h3>
              {selectFilter(
                "Jármű",
                "vehicleId",
                state.vehicles.map((vehicle) => ({
                  value: vehicle.id,
                  label: vehicle.plate,
                })),
                "Minden jármű",
              )}
              {selectFilter(
                "Sofőr",
                "driverId",
                state.drivers.map((driver) => ({
                  value: driver.id,
                  label: driver.name,
                })),
                "Minden sofőr",
              )}
            </div>
            <div className="orders-ws-filter-section">
              <h3>Pénzügy és dokumentum</h3>
              {selectFilter(
                "Fuvardíj pénzneme",
                "currency",
                [
                  { value: "HUF", label: "HUF" },
                  { value: "EUR", label: "EUR" },
                ],
                "Minden pénznem",
              )}
              <div className="orders-ws-range">
                <label className="orders-ws-field">
                  <span>Min. díj (HUF)</span>
                  <input
                    aria-label="Minimum fuvardíj HUF egyenérték"
                    type="number"
                    min="0"
                    value={filters.priceMin}
                    onChange={(event) =>
                      patchFilters({ priceMin: event.target.value })
                    }
                    placeholder="0"
                  />
                </label>
                <label className="orders-ws-field">
                  <span>Max. díj (HUF)</span>
                  <input
                    aria-label="Maximum fuvardíj HUF egyenérték"
                    type="number"
                    min="0"
                    value={filters.priceMax}
                    onChange={(event) =>
                      patchFilters({ priceMax: event.target.value })
                    }
                    placeholder="Nincs korlát"
                  />
                </label>
              </div>
              {selectFilter(
                "Fedezet",
                "margin",
                [
                  { value: "negative", label: "Negatív fedezet" },
                  { value: "low", label: "15% alatti fedezet" },
                ],
                "Minden fedezet",
              )}
              {selectFilter(
                "Dokumentáció",
                "documents",
                [
                  { value: "missing-order", label: "Hiányzó megbízás" },
                  { value: "missing-cmr", label: "Hiányzó CMR" },
                  { value: "complete", label: "Megbízás és CMR megérkezett" },
                ],
                "Minden dokumentumállapot",
              )}
            </div>
            <footer>
              <button onClick={clearFilters}>Szűrők alaphelyzetbe</button>
              <span>{visible.length} találat a jelenlegi feltételekkel</span>
            </footer>
          </aside>
        ) : null}
      </section>
      {order ? (
        <Modal
          title={`${order.reference}${editing ? " · szerkesztés" : ""}`}
          onClose={close}
          wide
        >
          <div className="orders-ws-modal-context">
            <div>
              <strong>
                {
                  state.partners.find(
                    (partner) => partner.id === order.partnerId,
                  )?.name
                }
              </strong>
              <span>{orderRoute(order)}</span>
            </div>
            <StatusBadge status={order.status} />
          </div>
          <nav
            className="orders-ws-modal-nav"
            aria-label="Fuvar adatlap nézete"
          >
            <button
              className={editing ? "active" : ""}
              onClick={() => setEditing(true)}
            >
              Adatok és rakodási terv
            </button>
            <button
              className={!editing ? "active" : ""}
              onClick={() => setEditing(false)}
            >
              Áttekintés és dokumentumok
            </button>
          </nav>
          <div className="orders-ws-editor-panel" hidden={!editing}>
            <OrderEditor
              key={order.id}
              order={order}
              onCancel={close}
              onSaved={() => setEditing(false)}
            />
          </div>
          <div className="orders-ws-overview-panel" hidden={editing}>
            <div className="modal-body">
              <div className="detail-hero">
                <div>
                  <p className="eyebrow">
                    {state.partners.find((p) => p.id === order.partnerId)?.name}
                  </p>
                  <h3>{orderRoute(order)}</h3>
                  <p>
                    {order.cargo.name} · {number(order.cargo.kg)} kg ·{" "}
                    {order.cargo.pieces} db · {order.cargo.ldm} LDM ·{" "}
                    {order.type}
                  </p>
                </div>
                <StatusBadge status={order.status} />
              </div>
              <div className="workflow-strip">
                {statuses.map((s) => (
                  <span
                    className={
                      statuses.indexOf(s) <= statuses.indexOf(order.status)
                        ? "done"
                        : ""
                    }
                    key={s}
                  >
                    {s}
                  </span>
                ))}
              </div>
              <div className="detail-grid">
                <div>
                  <span>Fuvardíj</span>
                  <strong>{money(order.price, order.currency)}</strong>
                </div>
                <div>
                  <span>Terv / tényköltség</span>
                  <strong>
                    {money(order.plannedCost)} / {money(order.actualCost)}
                  </strong>
                </div>
                <div>
                  <span>Kapcsolattartó</span>
                  <strong>{order.contact || "—"}</strong>
                </div>
                <div>
                  <span>Felelős fuvarszervező</span>
                  <strong>{order.dispatcher}</strong>
                </div>
                <div>
                  <span>Rögzítve</span>
                  <strong>
                    {new Date(order.createdAt).toLocaleString("hu-HU", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "Europe/Budapest",
                    })}
                  </strong>
                </div>
                <div>
                  <span>Rögzítette</span>
                  <strong>{order.createdBy || "Nincs korábbi adat"}</strong>
                </div>
                <div>
                  <span>Cég / üzletág</span>
                  <strong>
                    {companies.find((c) => c.id === order.companyId)?.name} ·{" "}
                    {order.division}
                  </strong>
                </div>
                <div>
                  <span>Rakott / üres út</span>
                  <strong>
                    {number(order.loadedKm)} / {number(order.emptyKm)} km
                  </strong>
                </div>
              </div>
              <h3 className="section-label">Kiosztott erőforrás</h3>
              <div className="detail-grid">
                <div>
                  <span>Kamion</span>
                  <strong>
                    {state.vehicles.find((v) => v.id === order.vehicleId)
                      ?.plate || "Nincs kiosztva"}
                  </strong>
                </div>
                <div>
                  <span>Sofőr</span>
                  <strong>
                    {state.drivers.find((d) => d.id === order.driverId)?.name ||
                      "Nincs kiosztva"}
                  </strong>
                </div>
                <div>
                  <span>Pótkocsi</span>
                  <strong>{order.trailer || "Nincs hozzárendelve"}</strong>
                </div>
              </div>
              {canReassign ? (
                <div className="inline-form">
                  <Field label="Jármű és hozzárendelt sofőr">
                    <select
                      disabled={isSaving}
                      value={selectedVehicle || ""}
                      onChange={(e) =>
                        setVehicleChoice({
                          orderId: order.id,
                          id: e.target.value,
                        })
                      }
                    >
                      <option value="">Válassz járművet</option>
                      {state.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.plate} ·{" "}
                          {state.drivers.find((d) => d.id === v.driverId)
                            ?.name || v.model}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button
                    className="button"
                    disabled={isSaving || !selectedVehicle}
                    onClick={() => {
                      if (assign(order.id, selectedVehicle || ""))
                        setVehicleChoice(null);
                    }}
                  >
                    Kiosztás
                  </button>
                </div>
              ) : canOperate &&
                !["Új", "Tervezett", "Kiosztva"].includes(order.status) ? (
                <p className="muted spaced">
                  A teljesítés alatt álló vagy lezárt fuvar erőforrása itt már
                  nem osztható át.
                </p>
              ) : null}
              <h3 className="section-label">Rakodási terv</h3>
              <div className="stop-list">
                {order.stops.map((s, i) => (
                  <div key={s.id}>
                    <b>{i + 1}</b>
                    <div>
                      <strong>
                        {s.city} · {s.type}
                      </strong>
                      <p>
                        {s.address} · {s.date} {s.time}
                      </p>
                      {s.cargoItems?.map((item) => (
                        <p key={item.id} className="muted">
                          {item.name} · {number(item.kg)} kg · {item.pieces} db
                          · {item.ldm} LDM
                          {item.lengthCm || item.widthCm || item.heightCm
                            ? ` · ${item.lengthCm ?? "—"} × ${item.widthCm ?? "—"} × ${item.heightCm ?? "—"} cm`
                            : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {order.cargo.adr || order.requirements || order.notes ? (
                <>
                  <h3 className="section-label">Különleges követelmények</h3>
                  <div className="detail-grid">
                    <div>
                      <span>ADR</span>
                      <strong>
                        {order.cargo.adr
                          ? `Veszélyes áru${order.requirements?.adrUnNumber ? ` · UN ${order.requirements.adrUnNumber}` : ""}`
                          : "Nem ADR"}
                      </strong>
                    </div>
                    <div>
                      <span>Plombaszám</span>
                      <strong>
                        {order.requirements?.sealNumber || "Nincs megadva"}
                      </strong>
                    </div>
                    <div>
                      <span>Hőmérsékleti tartomány</span>
                      <strong>
                        {order.requirements?.temperatureMin !== undefined ||
                        order.requirements?.temperatureMax !== undefined
                          ? `${order.requirements.temperatureMin ?? "—"} – ${order.requirements.temperatureMax ?? "—"} °C`
                          : "Nincs előírva"}
                      </strong>
                    </div>
                  </div>
                  {order.requirements?.instructions ? (
                    <Notice>{order.requirements.instructions}</Notice>
                  ) : null}
                  {order.notes ? <p className="spaced">{order.notes}</p> : null}
                </>
              ) : null}
              <h3 className="section-label">Kapcsolódó dokumentumok</h3>
              {state.documents
                .filter((d) => d.orderId === order.id)
                .map((d) => (
                  <div className="list-line" key={d.id}>
                    <Icon name="invoice" size={16} />
                    {d.name}
                    <span className="muted">
                      {d.type} · v{d.version}
                    </span>
                    {d.blobId ? (
                      <button
                        className="icon-btn"
                        aria-label={`${d.name} letöltése`}
                        onClick={() =>
                          void downloadFile(d.blobId!, d.name).catch(
                            (error: unknown) =>
                              notify(
                                error instanceof Error
                                  ? error.message
                                  : "A dokumentum nem tölthető le.",
                                true,
                              ),
                          )
                        }
                      >
                        <Icon name="download" size={15} />
                      </button>
                    ) : (
                      <Badge>Minta</Badge>
                    )}
                  </div>
                ))}
              <Link className="text-link" href="/documents">
                Dokumentum csatolása →
              </Link>
            </div>
            <footer className="modal-actions">
              <button
                className="button"
                disabled={!canOperate || isSaving}
                onClick={() => void copy(order)}
              >
                <Icon name="plus" size={14} />
                Másolás
              </button>
              {user.role !== "viewer" ? (
                <button
                  className="button"
                  disabled={isSaving}
                  onClick={() => setEditing(true)}
                >
                  <Icon name="settings" size={14} />
                  Adatok szerkesztése
                </button>
              ) : null}
              <button
                className="button primary"
                disabled={!canOperate || isSaving || order.status === "Lezárva"}
                onClick={() => {
                  const next = statuses[statuses.indexOf(order.status) + 1];
                  if (next) transition(order.id, next);
                  else notify("A fuvar már lezárult.");
                }}
              >
                Következő státusz →
              </button>
            </footer>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
