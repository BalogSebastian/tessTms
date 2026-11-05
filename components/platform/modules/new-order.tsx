"use client";
import Link from "next/link";
import { useState } from "react";
import { useTms } from "../store";
import {
  companies,
  freeCredit,
  huf,
  money,
  uid,
  type Order,
  type CompanyId,
  type Currency,
} from "../../../lib/tms/model";
import { validateOrder, assignmentError } from "../../../lib/tms/rules";
import { saveFile, downloadBlob } from "../../../lib/tms/files";
import { PageTitle } from "../ui/page-title";
import { Field, Panel, Notice, Badge } from "../ui/primitives";
import { Icon } from "../ui/icon";
const steps = [
  "Indítás",
  "Megbízó",
  "Rakodás & áru",
  "Díj & költség",
  "Erőforrás",
  "Dokumentum",
  "Visszaigazolás",
  "Mentés",
];
function initial(): Order {
  return {
    id: "",
    reference: "",
    partnerId: "p1",
    companyId: "steel",
    division: "Általános",
    type: "Belföld",
    dispatcher: "Balog Sebastian",
    contact: "Nagy András",
    createdAt: "",
    status: "Új",
    stops: [
      {
        id: "stop-a",
        type: "Felrakó",
        city: "",
        address: "",
        date: "2026-11-06",
        time: "08:00",
      },
      {
        id: "stop-b",
        type: "Lerakó",
        city: "",
        address: "",
        date: "2026-11-06",
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
  };
}
export default function NewOrder() {
  const { state, mutate, notify } = useTms();
  const [order, setOrder] = useState<Order>(initial);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [approved, setApproved] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function patch(p: Partial<Order>) {
    setOrder((o) => ({ ...o, ...p }));
    setApproved(false);
  }
  const partner = state.partners.find((p) => p.id === order.partnerId);
  const credit = freeCredit(state, order.partnerId);
  const margin = huf(order.price, order.currency) - order.plannedCost;
  function next() {
    let message = "";
    if (step === 1 && (!order.reference.trim() || credit <= 0))
      message = "Megbízásszám és pozitív szabad hitelkeret szükséges.";
    if (
      step === 2 &&
      (!order.stops.every((s) => s.city && s.address && s.date && s.time) ||
        !order.cargo.name ||
        order.cargo.kg <= 0)
    )
      message = "Töltsd ki az összes megállót és az áruadatokat.";
    if (step === 3) message = validateOrder(state, order)[0] || "";
    if (step === 4)
      message = assignmentError(state, order, order.vehicleId) || "";
    if (step === 5 && !file) message = "Csatold a kapott fuvarmegbízást.";
    if (step === 6 && !approved)
      message = "Ellenőrizd és fogadd el a visszaigazolást.";
    setError(message);
    if (!message) setStep((s) => s + 1);
  }
  function sample() {
    patch({
      ...initial(),
      reference: `DEMO-${Date.now().toString().slice(-6)}`,
      stops: [
        {
          id: "a",
          type: "Felrakó",
          city: "Győr",
          address: "Ipari park 12.",
          date: "2026-11-06",
          time: "08:00",
        },
        {
          id: "b",
          type: "Lerakó",
          city: "Budaörs",
          address: "Logisztika utca 9.",
          date: "2026-11-06",
          time: "14:00",
        },
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
    notify("Mintaadatok betöltve.");
  }
  function confirmation() {
    const esc = (s: string) =>
      s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    downloadBlob(
      new Blob(
        [
          `<!DOCTYPE html><html lang="hu"><meta charset="utf-8"><title>Visszaigazolás</title><style>body{font:16px Arial;max-width:800px;margin:60px auto;color:#15392f}h1{border-bottom:3px solid #168267;padding-bottom:20px}p{line-height:1.6}</style><h1>tessTMS · Fuvarmegbízás visszaigazolás</h1><h2>${esc(order.reference)}</h2><p>Megbízó: ${esc(partner?.name || "")}</p><p>${order.stops.map((s) => `${esc(s.type)}: ${esc(s.city)}, ${esc(s.address)} · ${esc(s.date)} ${esc(s.time)}`).join("<br>")}</p><p>Áru: ${esc(order.cargo.name)} · ${order.cargo.kg} kg</p><p>Fuvardíj: ${esc(money(order.price, order.currency))}</p><p>Kapcsolattartó: ${esc(order.contact)}</p><small>Helyi demó visszaigazolás. Nyomtatással PDF-be menthető.</small></html>`,
        ],
        { type: "text/html;charset=utf-8" },
      ),
      `${order.reference || "visszaigazolas"}.html`,
    );
  }
  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      const id = uid();
      const complete = { ...order, id, createdAt: new Date().toISOString() };
      const errors = validateOrder(state, complete);
      if (errors.length) throw new Error(errors[0]);
      if (!file || !approved)
        throw new Error("Dokumentum és jóváhagyott visszaigazolás szükséges.");
      const err = assignmentError(state, complete, complete.vehicleId);
      if (err) throw new Error(err);
      const docId = uid();
      await saveFile(file, docId);
      if (
        mutate("Fuvar és dokumentum mentve", complete.reference, (d) => {
          const errors = validateOrder(d, complete);
          if (errors.length) throw new Error(errors[0]);
          const err = assignmentError(d, complete, complete.vehicleId);
          if (err) throw new Error(err);
          d.orders.unshift(complete);
          d.documents.unshift({
            id: docId,
            blobId: docId,
            name: file.name,
            orderId: id,
            type: "Megbízás",
            createdAt: complete.createdAt,
            version: 1,
          });
        })
      ) {
        setDone(true);
      }
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
        <p className="eyebrow">FUVARMEGBÍZÁS LÉTREHOZVA</p>
        <h1>{order.reference}</h1>
        <p>
          A fuvar, a dokumentum és az eseményelőzmény a helyi munkatérbe került.
        </p>
        <Link className="button primary" href="/orders">
          Megbízások megnyitása <Icon name="arrow" size={16} />
        </Link>
      </div>
    );
  return (
    <>
      <PageTitle
        title="Új fuvarmegbízás"
        description="Nyolc átlátható lépés, minden fontos ellenőrzéssel."
      >
        <button className="button" onClick={sample}>
          Mintaadatok betöltése
        </button>
      </PageTitle>
      <ol className="stepper">
        {steps.map((s, i) => (
          <li
            className={i === step ? "current" : i < step ? "completed" : ""}
            key={s}
          >
            <b>{i < step ? "✓" : i + 1}</b>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <div className="form-layout">
        <Panel title={`${String(step + 1).padStart(2, "0")} / ${steps[step]}`}>
          <div className="form-body">
            {step === 0 ? (
              <div className="start-options">
                <Icon name="orders" size={40} />
                <h2>Indulhat az új megbízás.</h2>
                <p>
                  A rögzítés során végig látod a partnert, a díjat és a szabad
                  hitelkeretet.
                </p>
                <div className="option-card">
                  <strong>Kézi rögzítés</strong>
                  <p>Strukturált adatok, ellenőrzött mentés.</p>
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
              <div className="form-grid">
                <Field label="Megbízó partner">
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
                    {state.partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Fuvarmegbízás száma *">
                  <input
                    value={order.reference}
                    onChange={(e) => patch({ reference: e.target.value })}
                  />
                </Field>
                <Field label="Partner kapcsolattartója">
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
                    <option>Általános</option>
                    <option>Bitumen</option>
                    <option>ADR</option>
                    <option>Konténer</option>
                  </select>
                </Field>
                <Field label="Felelős fuvarszervező">
                  <input
                    value={order.dispatcher}
                    onChange={(e) => patch({ dispatcher: e.target.value })}
                  />
                </Field>
                <Field label="Rögzítő">
                  <input readOnly value="Balog Sebastian" />
                </Field>
              </div>
            ) : null}
            {step === 2 ? (
              <>
                <div className="editable-stops">
                  {order.stops.map((s, i) => (
                    <div className="stop-editor" key={s.id}>
                      <div className="stop-editor-head">
                        <b>{i + 1}</b>
                        <select
                          aria-label={`${i + 1}. megálló típusa`}
                          value={s.type}
                          onChange={(e) =>
                            patch({
                              stops: order.stops.map((x) =>
                                x.id === s.id
                                  ? {
                                      ...x,
                                      type: e.target.value as
                                        "Felrakó" | "Lerakó",
                                    }
                                  : x,
                              ),
                            })
                          }
                        >
                          <option>Felrakó</option>
                          <option>Lerakó</option>
                        </select>
                        {order.stops.length > 2 ? (
                          <button
                            className="icon-btn"
                            aria-label="Megálló törlése"
                            onClick={() =>
                              patch({
                                stops: order.stops.filter((x) => x.id !== s.id),
                              })
                            }
                          >
                            <Icon name="close" size={14} />
                          </button>
                        ) : null}
                      </div>
                      <div className="form-grid">
                        {(["city", "address", "date", "time"] as const).map(
                          (key, j) => (
                            <Field
                              label={
                                ["Város *", "Cím *", "Dátum *", "Időpont *"][j]
                              }
                              key={key}
                            >
                              <input
                                type={
                                  key === "date"
                                    ? "date"
                                    : key === "time"
                                      ? "time"
                                      : "text"
                                }
                                value={s[key]}
                                onChange={(e) =>
                                  patch({
                                    stops: order.stops.map((x) =>
                                      x.id === s.id
                                        ? { ...x, [key]: e.target.value }
                                        : x,
                                    ),
                                  })
                                }
                              />
                            </Field>
                          ),
                        )}
                      </div>
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
                          date: "2026-11-06",
                          time: "16:00",
                        },
                      ],
                    })
                  }
                >
                  <Icon name="plus" size={14} />
                  Új megálló
                </button>
                <h3 className="section-label">Áruadatok</h3>
                <div className="form-grid">
                  {(["name", "kg", "pieces", "ldm"] as const).map((key, i) => (
                    <Field
                      label={
                        [
                          "Áru megnevezése *",
                          "Tömeg (kg) *",
                          "Darabszám *",
                          "Rakodóméter (LDM)",
                        ][i]
                      }
                      key={key}
                    >
                      <input
                        type={key === "name" ? "text" : "number"}
                        min="0"
                        step="any"
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
                        })
                      }
                    />{" "}
                    ADR veszélyes áru
                  </label>
                </div>
              </>
            ) : null}
            {step === 3 ? (
              <>
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
                        value={order[key]}
                        onChange={(e) =>
                          patch({ [key]: Number(e.target.value) })
                        }
                      />
                    </Field>
                  ))}
                  <Field label="Deviza">
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
                  Az EUR összegek a demóban 400 HUF/EUR rögzített árfolyammal
                  szerepelnek a hitelkeretben.
                </Notice>
                <div className="finance-highlight">
                  <span>Tervezett fedezet</span>
                  <strong>{money(margin)}</strong>
                  <Badge tone={margin >= 0 ? "green" : "red"}>
                    {order.price
                      ? (
                          (margin / huf(order.price, order.currency)) *
                          100
                        ).toFixed(1)
                      : 0}
                    %
                  </Badge>
                </div>
              </>
            ) : null}
            {step === 4 ? (
              <>
                <Field label="Kamion kiválasztása">
                  <select
                    value={order.vehicleId}
                    onChange={(e) => {
                      const v = state.vehicles.find(
                        (v) => v.id === e.target.value,
                      );
                      patch({
                        vehicleId: v?.id || "",
                        driverId: v?.driverId || "",
                        trailer: v?.trailer || "",
                        emptyKm:
                          v?.lastCity === order.stops[0]?.city
                            ? 0
                            : order.emptyKm,
                      });
                    }}
                  >
                    <option value="">Válassz járművet</option>
                    {state.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate} · {v.model}
                      </option>
                    ))}
                  </select>
                </Field>
                {order.vehicleId ? (
                  <div className="detail-grid spaced">
                    <div>
                      <span>Sofőr</span>
                      <strong>
                        {
                          state.drivers.find((d) => d.id === order.driverId)
                            ?.name
                        }
                      </strong>
                    </div>
                    <div>
                      <span>Pótkocsi</span>
                      <strong>{order.trailer}</strong>
                    </div>
                    <div>
                      <span>Előző lerakóhely</span>
                      <strong>
                        {
                          state.vehicles.find((v) => v.id === order.vehicleId)
                            ?.lastCity
                        }
                      </strong>
                    </div>
                    <div>
                      <span>Vezetési idő tartalék</span>
                      <strong>
                        {
                          state.drivers.find((d) => d.id === order.driverId)
                            ?.drivingMinutes
                        }{" "}
                        perc
                      </strong>
                    </div>
                  </div>
                ) : null}
                <Notice>
                  A kapacitás, ADR-képesség, foglaltság és vezetési idő
                  demóadatokból ellenőrzött. Az üres km eltérő településnél kézi
                  adat.
                </Notice>
              </>
            ) : null}
            {step === 5 ? (
              <label className="upload-zone">
                <Icon name="import" size={33} />
                <strong>
                  {file?.name || "Kapott fuvarmegbízás csatolása"}
                </strong>
                <span>
                  PDF, JPG, PNG, WEBP · legfeljebb 20 MB · helyi tárolás
                </span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            ) : null}
            {step === 6 ? (
              <>
                <div className="confirmation-sheet">
                  <span className="wordmark small-wordmark">tessTMS</span>
                  <h2>Fuvarmegbízás visszaigazolás</h2>
                  <p>
                    {order.reference} · {partner?.name}
                  </p>
                  {order.stops.map((s) => (
                    <p key={s.id}>
                      <strong>{s.type}:</strong> {s.city}, {s.address} ·{" "}
                      {s.date} {s.time}
                    </p>
                  ))}
                  <hr />
                  <p>
                    {order.cargo.name} · {order.cargo.kg} kg
                  </p>
                  <h3>{money(order.price, order.currency)}</h3>
                </div>
                <button className="button" onClick={confirmation}>
                  <Icon name="download" size={15} />
                  Visszaigazolás letöltése (HTML)
                </button>
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
                  <h2>Minden készen áll a mentésre.</h2>
                  <p>
                    {order.reference} · {partner?.name}
                  </p>
                </div>
                <Field label="Megjegyzés / rakodási utasítás">
                  <textarea
                    value={order.notes}
                    onChange={(e) =>
                      setOrder((o) => ({ ...o, notes: e.target.value }))
                    }
                  />
                </Field>
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
              disabled={step === 0}
              onClick={() => {
                setError("");
                setStep((s) => s - 1);
              }}
            >
              ← Vissza
            </button>
            {step < 7 ? (
              <button className="button primary" onClick={next}>
                Tovább <Icon name="right" size={15} />
              </button>
            ) : (
              <button
                className="button primary"
                disabled={busy}
                onClick={finish}
              >
                {busy ? "Mentés…" : "Fuvar mentése"}
                <Icon name="check" size={16} />
              </button>
            )}
          </footer>
        </Panel>
        <aside className="order-summary">
          <p className="eyebrow">MEGBÍZÁS ÁTTEKINTÉS</p>
          <h3>{order.reference || "Új megbízás"}</h3>
          <p>{partner?.name}</p>
          <dl>
            <div>
              <dt>Kapcsolattartó</dt>
              <dd>{order.contact}</dd>
            </div>
            <div>
              <dt>Fuvar típusa</dt>
              <dd>{order.type}</dd>
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
              <dd
                className={
                  credit - huf(order.price, order.currency) < 0
                    ? "negative"
                    : "positive"
                }
              >
                {money(credit - huf(order.price, order.currency))}
              </dd>
            </div>
            <div>
              <dt>Tervezett fedezet</dt>
              <dd>{money(margin)}</dd>
            </div>
          </dl>
          <Badge
            tone={credit >= huf(order.price, order.currency) ? "green" : "red"}
          >
            {credit >= huf(order.price, order.currency)
              ? "Hitelkereten belül"
              : "Hitelkeret-túllépés"}
          </Badge>
        </aside>
      </div>
    </>
  );
}
