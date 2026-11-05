"use client";
import { useState } from "react";
import { useTms } from "../store";
import { uid } from "../../../lib/tms/model";
import { importOrders, parseCsv } from "../../../lib/tms/import";
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  readImportSpreadsheet,
} from "../../../lib/tms/spreadsheet";
import { exportCsv } from "../../../lib/tms/files";
import { PageTitle } from "../ui/page-title";
import { Panel, Notice, Table } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Intake() {
  const { state, mutateAsync, isSaving, notify } = useTms();
  const [csv, setCsv] = useState(
    "reference;partner;from;to;price;currency;kg\nIMP-2026-001;Duna Útépítő Kft.;Győr;Budapest;245000;HUF;18000",
  );
  const [preview, setPreview] = useState<string[][]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const batches = Array.from(
    new Set(
      state.orders.map((o) => o.batchId).filter((id): id is string => !!id),
    ),
  );
  const [tab, setTab] = useState("csv");
  function validate() {
    try {
      importOrders(state, csv, "preview");
      setPreview(parseCsv(csv.replace(/^\ufeff/, "")));
      setError("");
      notify("A sorok és az összesített hitelkeret ellenőrzése sikeres.");
    } catch (e) {
      setPreview([]);
      const message =
        e instanceof Error ? e.message : "Az import ellenőrzése sikertelen.";
      setError(message);
      notify(message, true);
    }
  }
  return (
    <>
      <PageTitle
        title="Rendelésfelvétel & import"
        description="Ellenőrzött tömeges beemelés, visszavonható kötegekkel."
      >
        <button
          className="button"
          onClick={() =>
            exportCsv("tms-import-sablon.csv", [
              [...IMPORT_COLUMNS],
              [
                "IMP-001",
                "Duna Útépítő Kft.",
                "Győr",
                "Budapest",
                245000,
                "HUF",
                18000,
              ],
            ])
          }
        >
          <Icon name="download" size={16} />
          CSV-sablon
        </button>
      </PageTitle>
      <div className="tabs">
        <button
          className={tab === "csv" ? "active" : ""}
          onClick={() => setTab("csv")}
        >
          CSV / Excel (.xlsx)
        </button>
        <button
          className={tab === "partner" ? "active" : ""}
          onClick={() => setTab("partner")}
        >
          Partneri rendelésminta
        </button>
        <button
          className={tab === "api" ? "active" : ""}
          onClick={() => setTab("api")}
        >
          API-szerződés
        </button>
      </div>
      {tab === "api" ? (
        <Panel title="Bejövő rendelési szerződés">
          <div className="form-body">
            <Notice>
              Az API még nincs publikálva. Éles fogadáshoz partnerenkénti
              hitelesítés, aláírás és idempotenciakulcs szükséges.
            </Notice>
            <pre>
              {JSON.stringify(
                {
                  idempotencyKey: "partner-reference-v1",
                  partnerReference: "IMP-001",
                  partnerId: "p1",
                  currency: "HUF",
                  price: 245000,
                  stops: [
                    { type: "pickup", city: "Győr" },
                    { type: "delivery", city: "Budapest" },
                  ],
                },
                null,
                2,
              )}
            </pre>
          </div>
        </Panel>
      ) : (
        <Panel
          title={
            tab === "csv"
              ? "Import előkészítése"
              : "Partneri rendelés helyi tesztje"
          }
        >
          <div className="form-body">
            <Notice>
              {tab === "partner"
                ? "A partneri beküldés helyi mintája ugyanazon validálással kerül be. Külső portálbejelentkezés még nincs csatlakoztatva."
                : "CSV vagy Excel (.xlsx) fájlt válassz, legfeljebb 5 MB és 1000 adatsor méretben. Excelnél az első munkalapot olvassuk; fejlécnek a CSV-sablon mezőneveit használd. Minden sor ellenőrzött; hibás kötegből semmi nem kerül be."}
            </Notice>
            <label className="file-input-label">
              <Icon name="import" size={18} />
              CSV- vagy Excel-fájl beolvasása
              <input
                type="file"
                accept=".csv,.xlsx"
                disabled={reading || isSaving}
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  setPreview([]);
                  setError("");
                  setReading(true);
                  try {
                    if (file.size > IMPORT_MAX_BYTES)
                      throw new Error("Legfeljebb 5 MB-os fájl olvasható be.");
                    if (!file.size)
                      throw new Error("A kiválasztott fájl üres.");
                    let content: string;
                    if (/\.xlsx$/i.test(file.name))
                      content = await readImportSpreadsheet(file);
                    else if (/\.csv$/i.test(file.name)) {
                      content = await file.text();
                      if (parseCsv(content).length - 1 > IMPORT_MAX_ROWS)
                        throw new Error(
                          `Egy import legfeljebb ${IMPORT_MAX_ROWS} adatsort tartalmazhat.`,
                        );
                    } else
                      throw new Error(
                        "CSV vagy .xlsx fájl szükséges. A régi .xls formátumot mentsd .xlsx-ként.",
                      );
                    setCsv(content);
                    setSource(file.name);
                    notify(
                      "A fájl beolvasva. Importálás előtt ellenőrizd a sorokat.",
                    );
                  } catch (failure) {
                    const message =
                      failure instanceof Error
                        ? failure.message
                        : "A fájl nem olvasható be.";
                    setError(message);
                    notify(message, true);
                  } finally {
                    setReading(false);
                    input.value = "";
                  }
                }}
              />
            </label>
            {reading ? (
              <p role="status" className="muted">
                Excel / CSV feldolgozása…
              </p>
            ) : source ? (
              <p className="muted">
                Beolvasott fájl: {source}. A tartalom lent ellenőrizhető és
                módosítható.
              </p>
            ) : null}
            <textarea
              aria-label="Import CSV tartalma"
              className="code-input"
              rows={7}
              disabled={reading || isSaving}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setPreview([]);
                setSource("");
                setError("");
              }}
            />
            {error ? (
              <div className="error-message" role="alert">
                <Icon name="alert" size={17} />
                {error}
              </div>
            ) : null}
            <div className="button-row">
              <button
                className="button"
                disabled={reading || isSaving}
                onClick={validate}
              >
                1. Ellenőrzés
              </button>
              <button
                className="button primary"
                disabled={!preview.length || reading || isSaving}
                onClick={async () => {
                  const id = uid();
                  if (
                    await mutateAsync("Importköteg beemelve", id, (d) => {
                      const rows = importOrders(d, csv, id);
                      d.orders.unshift(...rows);
                    })
                  ) {
                    setPreview([]);
                  }
                }}
              >
                2. Ellenőrzött sorok importálása
              </button>
            </div>
          </div>
          {preview.length ? (
            <Table headers={preview[0]}>
              {preview.slice(1).map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </Table>
          ) : null}
        </Panel>
      )}
      {batches.map((batch) => (
        <div className="notice" key={batch}>
          <Icon name="check" />
          <div>
            Importköteg ·{" "}
            {state.orders.filter((o) => o.batchId === batch).length} megbízás ·{" "}
            {batch.slice(0, 8)}{" "}
            <button
              className="text-link"
              disabled={isSaving || reading}
              onClick={() =>
                void mutateAsync("Importköteg visszavonva", batch, (d) => {
                  const list = d.orders.filter((o) => o.batchId === batch);
                  if (
                    list.some((o) => o.status !== "Új") ||
                    d.documents.some((doc) =>
                      list.some((o) => o.id === doc.orderId),
                    ) ||
                    d.costs.some((cost) =>
                      list.some((order) => order.id === cost.orderId),
                    ) ||
                    d.invoices.some((invoice) =>
                      list.some((order) => invoice.orderIds.includes(order.id)),
                    ) ||
                    d.messages.some((message) =>
                      list.some((order) => order.id === message.orderId),
                    ) ||
                    d.incidents.some((incident) =>
                      list.some((order) => order.id === incident.orderId),
                    ) ||
                    d.purchases.some((purchase) =>
                      list.some((order) => order.id === purchase.orderId),
                    )
                  )
                    throw new Error(
                      "A köteg már feldolgozás alatt áll, nem vonható vissza.",
                    );
                  d.orders = d.orders.filter((o) => o.batchId !== batch);
                })
              }
            >
              Visszavonás
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
