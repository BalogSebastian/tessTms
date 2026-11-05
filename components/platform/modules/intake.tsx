"use client";
import { useState } from "react";
import { useTms } from "../store";
import { uid } from "../../../lib/tms/model";
import { importOrders, parseCsv } from "../../../lib/tms/import";
import { exportCsv } from "../../../lib/tms/files";
import { PageTitle } from "../ui/page-title";
import { Panel, Notice, Table } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Intake() {
  const { state, mutate, notify } = useTms();
  const [csv, setCsv] = useState(
    "reference;partner;from;to;price;currency;kg\nIMP-2026-001;Duna Útépítő Kft.;Győr;Budapest;245000;HUF;18000",
  );
  const [preview, setPreview] = useState<string[][]>([]);
  const batches = Array.from(
    new Set(
      state.orders.map((o) => o.batchId).filter((id): id is string => !!id),
    ),
  );
  const [tab, setTab] = useState("csv");
  function validate() {
    try {
      importOrders(state, csv, "preview");
      setPreview(parseCsv(csv));
      notify("A sorok és az összesített hitelkeret ellenőrzése sikeres.");
    } catch (e) {
      setPreview([]);
      notify(String(e), true);
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
              ["reference", "partner", "from", "to", "price", "currency", "kg"],
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
          CSV / Excel-export
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
                : "Az Excelből pontosvesszővel tagolt CSV-t tölts fel. Minden sor ellenőrzött; hibás kötegből semmi nem kerül be."}
            </Notice>
            <label className="file-input-label">
              <Icon name="import" size={18} />
              CSV-fájl beolvasása
              <input
                type="file"
                accept=".csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 1024 * 1024)
                      return notify("Maximum 1 MB-os CSV olvasható be.", true);
                    setCsv(await f.text());
                    setPreview([]);
                  }
                }}
              />
            </label>
            <textarea
              aria-label="Import CSV tartalma"
              className="code-input"
              rows={7}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setPreview([]);
              }}
            />
            <div className="button-row">
              <button className="button" onClick={validate}>
                1. Ellenőrzés
              </button>
              <button
                className="button primary"
                disabled={!preview.length}
                onClick={() => {
                  const id = uid();
                  if (
                    mutate("Importköteg beemelve", id, (d) => {
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
              onClick={() =>
                mutate("Importköteg visszavonva", batch, (d) => {
                  const list = d.orders.filter((o) => o.batchId === batch);
                  if (
                    list.some((o) => o.status !== "Új") ||
                    d.documents.some((doc) =>
                      list.some((o) => o.id === doc.orderId),
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
