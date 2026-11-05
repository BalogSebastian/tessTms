"use client";
import Link from "next/link";
import { useState } from "react";
import { useTms } from "../store";
import { importOrders } from "../../../lib/tms/import";
import { uid } from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Panel, Field, Notice, Badge } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Scan() {
  const { state, mutate, notify } = useTms();
  const [file, setFile] = useState("");
  const [data, setData] = useState({
    reference: "OCR-MINTA-001",
    partner: state.partners[0]?.name || "",
    from: "Budapest",
    to: "Győr",
    price: "295000",
    currency: "HUF",
    kg: "19500",
  });
  const [reviewed, setReviewed] = useState(false);
  return (
    <>
      <PageTitle
        title="scanR · Adatkivonat-felülvizsgálat"
        description="Dokumentumtól az ellenőrzött, strukturált megbízásig."
      >
        <Badge tone="amber">OCR-szolgáltató nincs bekötve</Badge>
      </PageTitle>
      <Notice>
        Az automatikus karakterfelismerés még nem aktív. A felület kézzel
        ellenőrizhető mintakivonatot mutat; feltöltött dokumentumból jelenleg
        nem olvas ki adatot.
      </Notice>
      <div className="two-panel-grid">
        <Panel title="Forrásdokumentum">
          <div className="form-body">
            <label className="upload-zone">
              <Icon name="scan" size={38} />
              <strong>{file || "Válassz dokumentumot"}</strong>
              <span>A fájl neve az ellenőrzési munkamenethez kapcsolódik.</span>
              <input
                type="file"
                accept=".pdf,.jpg,.png"
                onChange={(e) => {
                  setFile(e.target.files?.[0]?.name || "");
                  setReviewed(false);
                }}
              />
            </label>
            <div className="scan-flow">
              <span>Dokumentum</span>
              <Icon name="right" />
              <span>Kézi felülvizsgálat</span>
              <Icon name="right" />
              <span>Fuvar</span>
            </div>
            <Link href="/documents" className="text-link">
              Valós dokumentum archiválása →
            </Link>
          </div>
        </Panel>
        <Panel title="Ellenőrizendő adatkivonat" actions={<Badge>Minta</Badge>}>
          <div className="form-body">
            <div className="form-grid">
              {Object.entries(data).map(([key, value], i) => (
                <Field
                  label={
                    [
                      "Megbízásszám",
                      "Partner neve",
                      "Felrakó város",
                      "Lerakó város",
                      "Fuvardíj",
                      "Deviza",
                      "Tömeg (kg)",
                    ][i]
                  }
                  key={key}
                >
                  <input
                    value={value}
                    onChange={(e) => {
                      setData((d) => ({ ...d, [key]: e.target.value }));
                      setReviewed(false);
                    }}
                  />
                </Field>
              ))}
            </div>
            <label className="checkbox-field spaced">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />{" "}
              A mezőket ellenőriztem.
            </label>
            <button
              className="button primary"
              disabled={!reviewed}
              onClick={() => {
                const protect = (v: string) =>
                  '"' + v.replaceAll('"', '""') + '"';
                const csv =
                  "reference;partner;from;to;price;currency;kg\n" +
                  Object.values(data).map(protect).join(";");
                if (
                  mutate(
                    "Ellenőrzött adatkivonat beemelve",
                    data.reference,
                    (d) => {
                      const rows = importOrders(d, csv, uid());
                      d.orders.unshift(...rows);
                    },
                  )
                )
                  notify("A megbízás bekerült a fuvarlistába.");
              }}
            >
              Ellenőrzött adatok beemelése
            </button>
          </div>
        </Panel>
      </div>
    </>
  );
}
