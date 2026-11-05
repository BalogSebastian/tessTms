"use client";
import Link from "next/link";
import { useState } from "react";
import { useTms } from "../store";
import {
  freeCredit,
  huf,
  money,
  number,
  uid,
  type Order,
  type CompanyId,
  type Currency,
  type CargoItem,
  type SpecialRequirements,
} from "../../../lib/tms/model";
import {
  validateOrder,
  validateStops,
  assignmentError,
} from "../../../lib/tms/rules";
import { saveFile, downloadBlob } from "../../../lib/tms/files";
import { PageTitle } from "../ui/page-title";
import { Field, Panel, Notice, Badge } from "../ui/primitives";
import { Icon } from "../ui/icon";
const steps = [
  "Indítás",
  "Megbízó",
  "Rakodás és áru",
  "Díj és költség",
  "Erőforrás",
  "Dokumentum",
  "Visszaigazolás",
  "Mentés",
];
const emptyRequirements: SpecialRequirements = {
  sealNumber: "",
  adrUnNumber: "",
  instructions: "",
};
const tomorrow = () =>
  new Date(Date.now() + 86400000).toLocaleDateString("en-CA", {
    timeZone: "Europe/Budapest",
  });
const normalizeCity = (value: string) =>
  value.trim().toLocaleLowerCase("hu-HU");
function initial(
  recorder: string,
  partnerId: string,
  contact: string,
  companyId: CompanyId,
): Order {
  return {
    id: uid(),
    reference: "",
    partnerId,
    companyId,
    division: "Általános",
    type: "Belföld",
    dispatcher: recorder,
    createdBy: recorder,
    contact,
    createdAt: new Date().toISOString(),
    status: "Új",
    stops: [
      {
        id: uid(),
        type: "Felrakó",
        city: "",
        address: "",
        date: tomorrow(),
        time: "08:00",
      },
      {
        id: uid(),
        type: "Lerakó",
        city: "",
        address: "",
        date: tomorrow(),
        time: "14:00",
      },
    ],
    cargo: { name: "", kg: 0, pieces: 1, ldm: 0, adr: false, type: "Ponyvás" },
    loadedKm: 0,
    emptyKm: 0,
    price: 0,
    currency: "HUF",
    plannedCost: 0,
    actualCost: 0,
    vehicleId: "",
    driverId: "",
    trailer: "",
    notes: "",
    requirements: { ...emptyRequirements },
  };
}
export default function NewOrder() {
  const { state, companies, mutateAsync, notify, user, isSaving } = useTms();
  const [order, setOrder] = useState<Order>(() =>
    initial(
      user.name,
      state.partners[0]?.id || "",
      state.partners[0]?.contact || "",
      companies[0]?.id || "",
    ),
  );
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [savedFile, setSavedFile] = useState("");
  const [approved, setApproved] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function patch(p: Partial<Order>) {
    setOrder((o) => ({ ...o, ...p }));
    setApproved(false);
    setError("");
  }
  function requirement(p: Partial<SpecialRequirements>) {
    patch({
      requirements: { ...emptyRequirements, ...order.requirements, ...p },
    });
  }
  function patchStop(id: string, p: Partial<Order["stops"][number]>) {
    patch({
      stops: order.stops.map((s) => (s.id === id ? { ...s, ...p } : s)),
    });
  }
  function patchItem(stopId: string, itemId: string, p: Partial<CargoItem>) {
    const stop = order.stops.find((s) => s.id === stopId)!;
    patchStop(stopId, {
      cargoItems: stop.cargoItems?.map((item) =>
        item.id === itemId ? { ...item, ...p } : item,
      ),
    });
  }
  const partner = state.partners.find((p) => p.id === order.partnerId);
  const credit = freeCredit(state, order.partnerId, order.id);
  const remaining = credit - huf(order.price, order.currency);
  const margin = huf(order.price, order.currency) - order.plannedCost;
  const vehicle = state.vehicles.find((v) => v.id === order.vehicleId);
  const approachRoute =
    vehicle &&
    state.routes.find(
      (route) =>
        normalizeCity(route.from) === normalizeCity(vehicle.lastCity) &&
        normalizeCity(route.to) === normalizeCity(order.stops[0]?.city || ""),
    );
  const driver = state.drivers.find((d) => d.id === order.driverId);
  const requirements = { ...emptyRequirements, ...order.requirements };
  const hasItems = order.stops.some((s) => s.cargoItems?.length);
  const created = new Date(order.createdAt).toLocaleString("hu-HU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Budapest",
  });
  function partnerError() {
    if (
      !partner ||
      !order.reference.trim() ||
      !order.dispatcher.trim() ||
      !order.contact.trim()
    )
      return "Add meg a partnert, megbízásszámot, kapcsolattartót és fuvarszervezőt.";
    if (credit <= 0)
      return "A partnernek nincs szabad hitelkerete. A rögzítés nem folytatható.";
    if (
      state.orders.some(
        (o) =>
          o.companyId === order.companyId &&
          o.reference.trim().toLocaleLowerCase("hu-HU") ===
            order.reference.trim().toLocaleLowerCase("hu-HU"),
      )
    )
      return "Ez a megbízásszám már létezik ennél a cégnél.";
    return "";
  }
  function next() {
    let message = "";
    if (step === 1) message = partnerError();
    if (step === 2) message = validateStops(order)[0] || "";
    if (step === 3) message = validateOrder(state, order)[0] || "";
    if (step === 4)
      message = assignmentError(state, order, order.vehicleId) || "";
    if (step === 5 && !file)
      message = "Csatold a kapott fuvarmegbízást a folytatáshoz.";
    if (step === 6 && !approved)
      message = "Ellenőrizd és fogadd el a visszaigazolást.";
    setError(message);
    if (!message) setStep((s) => s + 1);
  }
  function sample() {
    const draft = initial(
      user.name,
      state.partners[0]?.id || "",
      state.partners[0]?.contact || "",
      companies[0]?.id || "",
    );
    patch({
      ...draft,
      reference: `MINTA-${Date.now().toString().slice(-6)}`,
      stops: [
        { ...draft.stops[0], city: "Győr", address: "Ipari park 12." },
        { ...draft.stops[1], city: "Budaörs", address: "Logisztika utca 9." },
      ],
      cargo: {
        name: "Raklapos építőanyag",
        kg: 18000,
        pieces: 20,
        ldm: 12,
        adr: false,
        type: "Ponyvás",
      },
      loadedKm: 216,
      emptyKm: 32,
      price: 320000,
      plannedCost: 238000,
    });
    setStep(1);
    setFile(null);
    setSavedFile("");
    notify("Szerkeszthető mintaadatok betöltve.");
  }
  function confirmation() {
    const esc = (value: unknown) =>
      String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    const rows = order.stops
      .map(
        (s, i) =>
          `<tr><td>${i + 1}. ${esc(s.type)}</td><td><strong>${esc(s.city)}</strong><br>${esc(s.address)}${s.cargoItems?.map((item) => `<br><small>${esc(item.name)} · ${esc(number(item.kg))} kg · ${esc(item.pieces)} db${item.lengthCm ? ` · ${esc(item.lengthCm)} × ${esc(item.widthCm || "–")} × ${esc(item.heightCm || "–")} cm` : ""}</small>`).join("") || ""}</td><td>${esc(s.date)}<br>${esc(s.time)}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(order.reference)} – Visszaigazolás</title><style>*{box-sizing:border-box}body{font:14px/1.6 Arial,sans-serif;color:#17382e;max-width:860px;margin:48px auto;padding:32px}header{display:flex;justify-content:space-between;border-bottom:3px solid #178c67;padding-bottom:24px}.brand{font-size:30px;font-weight:bold;letter-spacing:-1px}.brand span{color:#178c67}h1{font-size:26px;line-height:1.25;margin:32px 0 8px}h2{font-size:17px;margin:28px 0 8px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px 32px;background:#f2f7f2;padding:20px;margin:24px 0}.meta small{display:block;color:#61766b}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:14px 10px;border-bottom:1px solid #dce6df;vertical-align:top}th{background:#f2f7f2;font-size:11px;text-transform:uppercase}.fee{font-size:28px;font-weight:bold;color:#14744f}footer{border-top:1px solid #dce6df;margin-top:40px;padding-top:16px;color:#61766b;font-size:11px}.print{display:block;margin:24px 0;border:0;border-radius:8px;padding:12px 18px;background:#14744f;color:white;cursor:pointer}@media print{body{margin:0;padding:12mm;max-width:none}.print{display:none}tr{break-inside:avoid}@page{size:A4;margin:8mm}}</style></head><body><header><div class="brand">tess<span>TMS</span></div><div>${esc(companies.find((c) => c.id === order.companyId)?.name)}<br>TESOTTER · Fuvarszervezés</div></header><h1>Fuvarmegbízás visszaigazolása</h1><p>${esc(order.reference)}</p><div class="meta"><div><small>Megbízó</small><strong>${esc(partner?.name)}</strong></div><div><small>Kapcsolattartó</small>${esc(order.contact)}</div><div><small>Fuvarszervező</small>${esc(order.dispatcher)}</div><div><small>Fuvar típusa / üzletág</small>${esc(order.type)} / ${esc(order.division)}</div></div><h2>Rakodási terv</h2><table><thead><tr><th>Megálló</th><th>Helyszín és áru</th><th>Időpont</th></tr></thead><tbody>${rows}</tbody></table><h2>Rakomány és erőforrás</h2><p>${esc(order.cargo.name)} · ${esc(number(order.cargo.kg))} kg · ${esc(order.cargo.pieces)} db · ${esc(order.cargo.ldm)} LDM<br>${esc(vehicle?.plate)} / ${esc(order.trailer)} · ${esc(driver?.name)}</p><p>${order.cargo.adr ? `ADR veszélyes áru${requirements.adrUnNumber ? ` · UN ${esc(requirements.adrUnNumber)}` : ""}<br>` : ""}${requirements.sealNumber ? `Plomba: ${esc(requirements.sealNumber)}<br>` : ""}${requirements.temperatureMin !== undefined || requirements.temperatureMax !== undefined ? `Hőmérséklet: ${esc(requirements.temperatureMin ?? "–")} – ${esc(requirements.temperatureMax ?? "–")} °C<br>` : ""}${esc(requirements.instructions).replaceAll("\n", "<br>")}</p><h2>Nettó fuvardíj</h2><p class="fee">${esc(money(order.price, order.currency))}</p><p>Rakott út: ${esc(order.loadedKm)} km · Üres út: ${esc(order.emptyKm)} km</p>${order.notes ? `<h2>Megjegyzés</h2><p>${esc(order.notes).replaceAll("\n", "<br>")}</p>` : ""}<button class="print" onclick="window.print()">Nyomtatás / mentés PDF-ként</button><footer>Rögzítette: ${esc(order.createdBy)} · ${esc(created)} · tessTMS / TESOTTER<br>A dokumentum a rögzített megbízás adatait tartalmazza. Elektronikus aláírást nem tartalmaz.</footer></body></html>`;
    downloadBlob(
      new Blob([html], { type: "text/html;charset=utf-8" }),
      `${order.reference.replace(/[^\p{L}\p{N}._-]/gu, "_") || "visszaigazolas"}.html`,
    );
  }
  async function finish() {
    if (busy || isSaving) return;
    setBusy(true);
    setError("");
    try {
      const complete = {
        ...order,
        reference: order.reference.trim(),
        status: "Kiosztva" as const,
      };
      const errors = validateOrder(state, complete);
      if (errors.length) throw new Error(errors[0]);
      if (!file || !approved)
        throw new Error("Dokumentum és jóváhagyott visszaigazolás szükséges.");
      const assignment = assignmentError(state, complete, complete.vehicleId);
      if (assignment) throw new Error(assignment);
      const docId = savedFile || uid();
      if (!savedFile) {
        await saveFile(file, docId);
        setSavedFile(docId);
      }
      const success = await mutateAsync(
        "Fuvar és dokumentum mentve",
        complete.reference,
        (draft) => {
          const validation = validateOrder(draft, complete);
          if (validation.length) throw new Error(validation[0]);
          const err = assignmentError(draft, complete, complete.vehicleId);
          if (err) throw new Error(err);
          draft.orders.unshift(complete);
          draft.documents.unshift({
            id: docId,
            blobId: docId,
            name: file.name,
            orderId: complete.id,
            type: "Megbízás",
            createdAt: new Date().toISOString(),
            version: 1,
          });
        },
      );
      if (success) setDone(true);
      else
        setError(
          "A mentés nem fejeződött be. Ellenőrizd az értesítést, majd próbáld újra.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mentési hiba.");
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className="success-panel">
        <span>
          <Icon name="check" size={32} />
        </span>
        <p className="eyebrow">FUVARMEGBÍZÁS ELMENTVE</p>
        <h1>{order.reference}</h1>
        <p>
          A fuvar, a csatolt dokumentum és az eseményelőzmény a központi
          munkatérbe került.
        </p>
        <div className="button-row">
          <Link className="button primary" href={`/orders?order=${order.id}`}>
            Megbízás megnyitása <Icon name="arrow" size={16} />
          </Link>
          <button className="button" onClick={confirmation}>
            Visszaigazolás letöltése
          </button>
        </div>
      </div>
    );
  return (
    <>
      <PageTitle
        title="Új fuvarmegbízás"
        description="Az első részlettől a visszaigazolásig. Minden egy helyen."
        eyebrow="MEGBÍZÁS RÖGZÍTÉSE"
      >
        <button className="button" onClick={sample}>
          <Icon name="sparkles" size={15} /> Mintaadatok betöltése
        </button>
      </PageTitle>
      <ol className="stepper">
        {steps.map((label, i) => (
          <li
            className={i === step ? "current" : i < step ? "completed" : ""}
            key={label}
            aria-current={i === step ? "step" : undefined}
          >
            <b>{i < step ? "✓" : i + 1}</b>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      {step > 1 ? (
        <section className="intake-context" aria-label="A megbízás alapadatai">
          <div>
            <span className="eyebrow">MEGBÍZÁS</span>
            <strong>{order.reference}</strong>
            <span>{partner?.name}</span>
          </div>
          <div>
            <small>Kapcsolattartó</small>
            <strong>{order.contact}</strong>
          </div>
          <div>
            <small>Fuvarszervező</small>
            <strong>{order.dispatcher}</strong>
          </div>
          <div>
            <small>
              {order.type} · {order.division}
            </small>
            <span>
              {created} · {order.createdBy}
            </span>
          </div>
          <button
            className="button small"
            onClick={() => {
              setStep(1);
              setError("");
            }}
          >
            <Icon name="settings" size={14} /> Alapadatok
          </button>
        </section>
      ) : null}
      <div className="form-layout">
        <Panel title={`${String(step + 1).padStart(2, "0")} / ${steps[step]}`}>
          <div className="form-body">
            {step === 0 ? (
              <div className="start-options">
                <span className="intake-start-icon">
                  <Icon name="orders" size={32} />
                </span>
                <p className="eyebrow">EGY ÚJ FELADAT KEZDETE</p>
                <h2>Indulhat a következő fuvar.</h2>
                <p>
                  Vezetett rögzítés, hitelkeret-ellenőrzés és egy átlátható
                  rakodási terv. A szükséges adatokkal végig kézben tartod a
                  megbízást.
                </p>
                <div className="option-card">
                  <strong>Kézi rögzítés</strong>
                  <p>Partner, áru, útvonal és erőforrás nyolc lépésben.</p>
                  <Badge tone="green">Kiválasztva</Badge>
                </div>
                <Link href="/scan" className="option-card">
                  <strong>
                    Dokumentumból indulok <Icon name="arrow" size={16} />
                  </strong>
                  <p>scanR adatkivonat-felülvizsgálat megnyitása.</p>
                </Link>
              </div>
            ) : null}
            {step === 1 ? (
              <>
                <div className="intake-section-heading">
                  <h3>Ki adja a megbízást?</h3>
                  <p>
                    A partner és a hitelkeret ellenőrzése megelőzi a fuvar
                    részleteit.
                  </p>
                </div>
                <div className="form-grid">
                  <Field label="Megbízó partner *">
                    <select
                      value={order.partnerId}
                      onChange={(e) =>
                        patch({
                          partnerId: e.target.value,
                          contact:
                            state.partners.find((p) => p.id === e.target.value)
                              ?.contact || "",
                        })
                      }
                    >
                      <option value="">Válassz partnert</option>
                      {state.partners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Fuvarmegbízás száma *">
                    <input
                      autoComplete="off"
                      placeholder="Pl. FUV-2026-00429"
                      maxLength={120}
                      value={order.reference}
                      onChange={(e) => patch({ reference: e.target.value })}
                    />
                  </Field>
                  <Field label="Partner kapcsolattartója *">
                    <input
                      value={order.contact}
                      onChange={(e) => patch({ contact: e.target.value })}
                    />
                  </Field>
                  <Field label="Saját cég">
                    <select
                      value={order.companyId}
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
                  <Field label="Fuvar típusa">
                    <select
                      value={order.type}
                      onChange={(e) => patch({ type: e.target.value })}
                    >
                      {["Belföld", "Export", "Import", "Körfuvar"].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Üzletág">
                    <select
                      value={order.division}
                      onChange={(e) => patch({ division: e.target.value })}
                    >
                      {["Általános", "Bitumen", "ADR", "Konténer"].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Felelős fuvarszervező *">
                    <input
                      value={order.dispatcher}
                      onChange={(e) => patch({ dispatcher: e.target.value })}
                    />
                  </Field>
                  <Field label="Rögzítette / rögzítés kezdete">
                    <input readOnly value={`${order.createdBy} · ${created}`} />
                  </Field>
                </div>
                <div
                  className={`intake-credit ${credit <= 0 ? "exceeded" : ""}`}
                >
                  <Icon name="shield" size={24} />
                  <div>
                    <small>Rendelkezésre álló hitelkeret</small>
                    <strong>{money(credit)}</strong>
                    <span>
                      {credit > 0
                        ? "A kintlévőségek és a nyitott fuvarok foglalásai levonva."
                        : "A rögzítés a hitelkeret rendezése után folytatható."}
                    </span>
                  </div>
                  <Badge tone={credit > 0 ? "green" : "red"}>
                    {credit > 0 ? "Ellenőrizve" : "Blokkolva"}
                  </Badge>
                </div>
              </>
            ) : null}
            {step === 2 ? (
              <>
                <div className="intake-section-heading">
                  <h3>Honnan, hová és mit szállítunk?</h3>
                  <p>
                    A megállók az útvonal sorrendjében követik egymást. Több
                    lerakó is hozzáadható.
                  </p>
                </div>
                <div className="editable-stops">
                  {order.stops.map((stop, i) => (
                    <div className="stop-editor" key={stop.id}>
                      <div className="stop-editor-head">
                        <b>{i + 1}</b>
                        <select
                          aria-label={`${i + 1}. megálló típusa`}
                          value={stop.type}
                          onChange={(e) =>
                            patchStop(stop.id, {
                              type: e.target.value as "Felrakó" | "Lerakó",
                            })
                          }
                        >
                          <option>Felrakó</option>
                          <option>Lerakó</option>
                        </select>
                        {order.stops.length > 2 ? (
                          <button
                            className="icon-btn"
                            aria-label={`${i + 1}. megálló törlése`}
                            onClick={() =>
                              patch({
                                stops: order.stops.filter(
                                  (s) => s.id !== stop.id,
                                ),
                              })
                            }
                          >
                            <Icon name="close" size={14} />
                          </button>
                        ) : null}
                      </div>
                      <div className="form-grid">
                        {(["city", "address", "date", "time"] as const).map(
                          (key, index) => (
                            <Field
                              label={
                                [
                                  "Város *",
                                  "Pontos cím *",
                                  "Dátum *",
                                  "Időpont *",
                                ][index]
                              }
                              key={key}
                            >
                              <input
                                type={
                                  key === "date" || key === "time"
                                    ? key
                                    : "text"
                                }
                                value={stop[key]}
                                onChange={(e) =>
                                  patchStop(stop.id, { [key]: e.target.value })
                                }
                              />
                            </Field>
                          ),
                        )}
                      </div>
                      {stop.cargoItems?.map((item, itemIndex) => (
                        <div className="intake-cargo-item" key={item.id}>
                          <div className="stop-editor-head">
                            <strong>{itemIndex + 1}. rakománytétel</strong>
                            <button
                              className="icon-btn"
                              aria-label="Rakománytétel törlése"
                              onClick={() =>
                                patchStop(stop.id, {
                                  cargoItems: stop.cargoItems?.filter(
                                    (x) => x.id !== item.id,
                                  ),
                                })
                              }
                            >
                              <Icon name="close" size={14} />
                            </button>
                          </div>
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
                            ).map((key, j) => (
                              <Field
                                key={key}
                                label={
                                  [
                                    "Tétel megnevezése *",
                                    "Tömeg (kg) *",
                                    "Darabszám *",
                                    "Rakodóméter",
                                    "Hossz (cm)",
                                    "Szélesség (cm)",
                                    "Magasság (cm)",
                                  ][j]
                                }
                              >
                                <input
                                  type={key === "name" ? "text" : "number"}
                                  min="0"
                                  step={key === "pieces" ? "1" : "any"}
                                  value={item[key] ?? ""}
                                  onChange={(e) =>
                                    patchItem(stop.id, item.id, {
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
                      <button
                        className="button small spaced"
                        onClick={() =>
                          patchStop(stop.id, {
                            cargoItems: [
                              ...(stop.cargoItems || []),
                              {
                                id: uid(),
                                name: order.cargo.name,
                                kg:
                                  order.stops.length === 2 ? order.cargo.kg : 0,
                                pieces:
                                  order.stops.length === 2
                                    ? order.cargo.pieces
                                    : 1,
                                ldm:
                                  order.stops.length === 2
                                    ? order.cargo.ldm
                                    : 0,
                              },
                            ],
                          })
                        }
                      >
                        <Icon name="plus" size={13} /> Rakománytétel hozzáadása
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="button small"
                  onClick={() =>
                    patch({
                      stops: [
                        ...order.stops,
                        {
                          id: uid(),
                          type: "Lerakó",
                          city: "",
                          address: "",
                          date: order.stops.at(-1)?.date || tomorrow(),
                          time: "16:00",
                        },
                      ],
                    })
                  }
                >
                  <Icon name="plus" size={14} /> Új megálló
                </button>
                {hasItems ? (
                  <Notice>
                    Tételszintű követés aktív. Minden megállónál add meg a
                    rakománytételeket. A felrakott és lerakott mennyiségeknek,
                    valamint az összesített áruadatoknak egyezniük kell.
                  </Notice>
                ) : null}
                <h3 className="section-label">Összesített áruadatok</h3>
                <div className="form-grid">
                  {(["name", "kg", "pieces", "ldm"] as const).map((key, i) => (
                    <Field
                      label={
                        [
                          "Áru megnevezése *",
                          "Összes tömeg (kg) *",
                          "Összes darabszám *",
                          "Rakodóméter (LDM)",
                        ][i]
                      }
                      key={key}
                    >
                      <input
                        type={key === "name" ? "text" : "number"}
                        min="0"
                        step={key === "pieces" ? "1" : "any"}
                        value={order.cargo[key]}
                        onChange={(e) =>
                          patch({
                            cargo: {
                              ...order.cargo,
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
                      value={order.cargo.type}
                      onChange={(e) =>
                        patch({
                          cargo: { ...order.cargo, type: e.target.value },
                        })
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
                      ].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={order.cargo.adr}
                      onChange={(e) =>
                        patch({
                          cargo: { ...order.cargo, adr: e.target.checked },
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
                      placeholder="Ha a rakomány plombált"
                      value={requirements.sealNumber}
                      onChange={(e) =>
                        requirement({ sealNumber: e.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label="ADR UN-szám"
                    hint="Négy számjegy; ADR rakomány esetén."
                  >
                    <input
                      disabled={!order.cargo.adr}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Pl. 1203"
                      value={requirements.adrUnNumber}
                      onChange={(e) =>
                        requirement({ adrUnNumber: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Minimum hőmérséklet (°C)">
                    <input
                      type="number"
                      step="any"
                      placeholder="Nem előírt"
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
                      placeholder="Nem előírt"
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
                    placeholder="Beléptetés, védőfelszerelés, szükséges okmányok…"
                    value={requirements.instructions}
                    onChange={(e) =>
                      requirement({ instructions: e.target.value })
                    }
                  />
                </Field>
                <Field label="Megjegyzés a megbízáshoz">
                  <textarea
                    placeholder="A visszaigazoláson is megjelenő kiegészítő információ…"
                    value={order.notes}
                    onChange={(e) => patch({ notes: e.target.value })}
                  />
                </Field>
              </>
            ) : null}
            {step === 3 ? (
              <>
                <div className="intake-section-heading">
                  <h3>A fuvar gazdasági oldala.</h3>
                  <p>
                    A fuvardíj foglalása azonnal megjelenik a hitelkeretben.
                  </p>
                </div>
                <div className="form-grid">
                  {(
                    ["loadedKm", "emptyKm", "price", "plannedCost"] as const
                  ).map((key, i) => (
                    <Field
                      label={
                        [
                          "Rakott kilométer",
                          "Üres kilométer",
                          "Nettó fuvardíj *",
                          "Tervezett költség (HUF)",
                        ][i]
                      }
                      key={key}
                    >
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={order[key]}
                        onChange={(e) =>
                          patch({ [key]: Number(e.target.value) })
                        }
                      />
                    </Field>
                  ))}
                  <Field label="Fuvardíj devizája">
                    <select
                      value={order.currency}
                      onChange={(e) =>
                        patch({ currency: e.target.value as Currency })
                      }
                    >
                      <option>HUF</option>
                      <option>EUR</option>
                    </select>
                  </Field>
                </div>
                <Notice>
                  Az EUR összegek a munkatér rögzített, 400 HUF/EUR tervezési
                  árfolyamán számítanak bele a hitelkeretbe. A kilométeradatok
                  ellenőrzött kézi értékek; útvonal-szolgáltató még nincs
                  csatlakoztatva.
                </Notice>
                <div className="finance-highlight">
                  <span>Tervezett fedezet</span>
                  <strong>{money(margin)}</strong>
                  <Badge tone={margin >= 0 ? "green" : "red"}>
                    {order.price > 0
                      ? (
                          (margin / huf(order.price, order.currency)) *
                          100
                        ).toFixed(1)
                      : 0}
                    %
                  </Badge>
                </div>
                {remaining < 0 ? (
                  <div className="error-message" role="alert">
                    <Icon name="alert" size={17} />A fuvardíj{" "}
                    {money(-remaining)} összeggel meghaladja a szabad
                    hitelkeretet. A továbblépés blokkolva.
                  </div>
                ) : null}
              </>
            ) : null}
            {step === 4 ? (
              <>
                <div className="intake-section-heading">
                  <h3>A megfelelő erőforrás a megfelelő fuvarhoz.</h3>
                  <p>
                    A jármű kiválasztása betölti a sofőrt, a pótkocsit és az
                    előző lerakóhelyet.
                  </p>
                </div>
                <Field label="Kamion kiválasztása *">
                  <select
                    value={order.vehicleId}
                    onChange={(e) => {
                      const v = state.vehicles.find(
                        (v) => v.id === e.target.value,
                      );
                      const storedApproach =
                        v &&
                        state.routes.find(
                          (route) =>
                            normalizeCity(route.from) ===
                              normalizeCity(v.lastCity) &&
                            normalizeCity(route.to) ===
                              normalizeCity(order.stops[0]?.city || ""),
                        );
                      patch({
                        vehicleId: v?.id || "",
                        driverId: v?.driverId || "",
                        trailer: v?.trailer || "",
                        emptyKm:
                          normalizeCity(v?.lastCity || "") ===
                          normalizeCity(order.stops[0]?.city || "")
                            ? 0
                            : (storedApproach?.km ?? order.emptyKm),
                      });
                    }}
                  >
                    <option value="">Válassz járművet</option>
                    {state.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate} · {v.model}
                        {assignmentError(state, order, v.id)
                          ? " · nem elérhető"
                          : " · elérhető"}
                      </option>
                    ))}
                  </select>
                </Field>
                {vehicle ? (
                  <>
                    <div className="intake-route-preview">
                      <div>
                        <small>Előző lerakóhely</small>
                        <strong>{vehicle.lastCity}</strong>
                      </div>
                      <Icon name="arrow" size={22} />
                      <div>
                        <small>Első felrakóhely</small>
                        <strong>{order.stops[0]?.city}</strong>
                      </div>
                      <span>{number(order.emptyKm)} üres km</span>
                    </div>
                    <div className="detail-grid spaced">
                      <div>
                        <span>Sofőr</span>
                        <strong>{driver?.name}</strong>
                      </div>
                      <div>
                        <span>Pótkocsi</span>
                        <strong>{order.trailer}</strong>
                      </div>
                      <div>
                        <span>Raksúly</span>
                        <strong>
                          {number(order.cargo.kg)} / {number(vehicle.capacity)}{" "}
                          kg
                        </strong>
                      </div>
                      <div>
                        <span>Vezetési idő tartalék</span>
                        <strong>{driver?.drivingMinutes} perc</strong>
                      </div>
                    </div>
                    <Field
                      label="Ellenőrzött üres kilométer"
                      hint="Az előző lerakó és az új felrakó közötti közúti távolság."
                    >
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={order.emptyKm}
                        onChange={(e) =>
                          patch({ emptyKm: Number(e.target.value) })
                        }
                      />
                    </Field>
                    {approachRoute ? (
                      <p className="muted spaced">
                        Tárolt megközelítési útvonal: {approachRoute.name} ·{" "}
                        {number(approachRoute.km)} km. A betöltött érték
                        felülvizsgálható.
                      </p>
                    ) : null}
                    {assignmentError(state, order, vehicle.id) ? (
                      <Notice tone="warning">
                        {assignmentError(state, order, vehicle.id)}
                      </Notice>
                    ) : null}
                  </>
                ) : null}
                <Notice>
                  Kapacitás, időbeli foglaltság, ADR-képesség és szerviz
                  ellenőrizve. A vezetési tartalék kézi törzsadat, nem
                  tachográf-számítás. Az üres km egyező településnél nulla,
                  egyébként tárolt útvonalból töltődik; útvonal hiányában kézi
                  adat.
                </Notice>
              </>
            ) : null}
            {step === 5 ? (
              <>
                <div className="intake-section-heading">
                  <h3>Az eredeti megbízás is a helyére kerül.</h3>
                  <p>
                    A dokumentum a fuvarhoz kapcsolva, jogosultságkezelt
                    fájltárba kerül.
                  </p>
                </div>
                <label className={`upload-zone ${file ? "has-file" : ""}`}>
                  <Icon name={file ? "check" : "import"} size={36} />
                  <strong>
                    {file?.name || "Kattints a fuvarmegbízás kiválasztásához"}
                  </strong>
                  <span>
                    {file
                      ? `${(file.size / 1024).toFixed(0)} KB · cseréhez válassz másik fájlt`
                      : "PDF, JPG, PNG, WEBP · legfeljebb 20 MB"}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => {
                      const selected = e.target.files?.[0] || null;
                      if (
                        selected &&
                        (selected.size > 20 * 1024 * 1024 ||
                          ![
                            "application/pdf",
                            "image/jpeg",
                            "image/png",
                            "image/webp",
                          ].includes(selected.type))
                      ) {
                        setError(
                          "PDF, JPG, PNG vagy WEBP fájl tölthető fel, legfeljebb 20 MB méretben.",
                        );
                        return;
                      }
                      setFile(selected);
                      setSavedFile("");
                      setError("");
                    }}
                  />
                </label>
                <Notice>
                  A fájl feltöltése a végső mentéskor történik. A böngésző
                  bezárása előtt fejezd be a megbízást.
                </Notice>
              </>
            ) : null}
            {step === 6 ? (
              <>
                <div className="confirmation-sheet">
                  <div className="intake-confirmation-brand">
                    <span className="wordmark small-wordmark">tessTMS</span>
                    <span>
                      {companies.find((c) => c.id === order.companyId)?.name}
                    </span>
                  </div>
                  <p className="eyebrow">ELLENŐRZÉSRE KÉSZ</p>
                  <h2>Fuvarmegbízás visszaigazolása</h2>
                  <p>
                    {order.reference} · {partner?.name}
                  </p>
                  <div className="intake-confirmation-stops">
                    {order.stops.map((s, i) => (
                      <div key={s.id}>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <div>
                          <small>{s.type}</small>
                          <strong>
                            {s.city}, {s.address}
                          </strong>
                          <small>
                            {s.date} · {s.time}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p>
                    {order.cargo.name} · {number(order.cargo.kg)} kg ·{" "}
                    {order.cargo.pieces} db · {order.cargo.ldm} LDM
                  </p>
                  <p>
                    {vehicle?.plate} / {order.trailer} · {driver?.name}
                  </p>
                  {requirements.instructions ? (
                    <p>{requirements.instructions}</p>
                  ) : null}
                  <hr />
                  <small>Nettó fuvardíj</small>
                  <h3>{money(order.price, order.currency)}</h3>
                  <p>
                    Kapcsolattartó: {order.contact} · Fuvarszervező:{" "}
                    {order.dispatcher}
                  </p>
                </div>
                <button className="button" onClick={confirmation}>
                  <Icon name="download" size={15} /> Visszaigazolás letöltése
                </button>
                <p className="muted spaced">
                  Nyomtatható HTML dokumentum. Megnyitás után a Nyomtatás
                  gombbal PDF-ként is menthető.
                </p>
                <label className="checkbox-field spaced">
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(e) => setApproved(e.target.checked)}
                  />{" "}
                  Az adatokat ellenőriztem és a visszaigazolást jóváhagyom.
                </label>
              </>
            ) : null}
            {step === 7 ? (
              <>
                <div className="ready-to-save">
                  <Icon name="check" size={34} />
                  <p className="eyebrow">MINDEN A HELYÉN</p>
                  <h2>Mentésre kész megbízás.</h2>
                  <p>
                    {order.reference} · {partner?.name}
                  </p>
                </div>
                <div className="key-value-list">
                  <div>
                    <span>Rakodási terv</span>
                    <strong>
                      {order.stops.length} megálló · {number(order.cargo.kg)} kg
                    </strong>
                  </div>
                  <div>
                    <span>Erőforrás</span>
                    <strong>
                      {vehicle?.plate} · {driver?.name}
                    </strong>
                  </div>
                  <div>
                    <span>Csatolt megbízás</span>
                    <strong>{file?.name}</strong>
                  </div>
                  <div>
                    <span>Visszaigazolás</span>
                    <strong>Jóváhagyva</strong>
                  </div>
                  <div>
                    <span>Nettó fuvardíj</span>
                    <strong>{money(order.price, order.currency)}</strong>
                  </div>
                </div>
                <Notice>
                  A mentés egy műveletben rögzíti a fuvar adatait, a dokumentum
                  kapcsolatát és az eseménynaplót.
                </Notice>
              </>
            ) : null}
            {error ? (
              <div className="error-message" role="alert">
                <Icon name="alert" size={17} />
                {error}
              </div>
            ) : null}
          </div>
          <footer className="form-actions">
            <button
              className="button"
              disabled={step === 0 || busy}
              onClick={() => {
                setError("");
                setStep((s) => s - 1);
              }}
            >
              ← Vissza
            </button>
            {step < 7 ? (
              <button
                className="button primary"
                disabled={
                  (step === 1 && credit <= 0) || (step === 3 && remaining < 0)
                }
                onClick={next}
              >
                {step === 0 ? "Új megbízás indítása" : "Tovább"}
                <Icon name="right" size={15} />
              </button>
            ) : (
              <button
                className="button primary"
                disabled={busy || isSaving}
                onClick={finish}
              >
                {busy ? "Mentés folyamatban…" : "Fuvarmegbízás mentése"}
                <Icon name="check" size={16} />
              </button>
            )}
          </footer>
        </Panel>
        <aside className="order-summary">
          <p className="eyebrow">A MEGBÍZÁS EGYBEN</p>
          <h3>{order.reference || "Új megbízás"}</h3>
          <p>{partner?.name || "A partner még nincs kiválasztva"}</p>
          <dl>
            <div>
              <dt>Kapcsolattartó</dt>
              <dd>{order.contact || "—"}</dd>
            </div>
            <div>
              <dt>Fuvar típusa</dt>
              <dd>{order.type}</dd>
            </div>
            <div>
              <dt>Rakodási pontok</dt>
              <dd>{order.stops.length} megálló</dd>
            </div>
            <div>
              <dt>Fuvardíj</dt>
              <dd>{money(order.price, order.currency)}</dd>
            </div>
            <div>
              <dt>Szabad hitelkeret</dt>
              <dd>{money(credit)}</dd>
            </div>
            <div>
              <dt>Fuvar után marad</dt>
              <dd className={remaining < 0 ? "negative" : "positive"}>
                {money(remaining)}
              </dd>
            </div>
            <div>
              <dt>Tervezett fedezet</dt>
              <dd>{money(margin)}</dd>
            </div>
          </dl>
          <Badge tone={credit > 0 && remaining >= 0 ? "green" : "red"}>
            {credit > 0 && remaining >= 0
              ? "Hitelkereten belül"
              : "Hitelkeret-túllépés"}
          </Badge>
          <div className="intake-summary-progress">
            <span>{step + 1} / 8 lépés</span>
            <div>
              <i style={{ width: `${((step + 1) / 8) * 100}%` }} />
            </div>
            <small>{steps[step]}</small>
          </div>
        </aside>
      </div>
    </>
  );
}
