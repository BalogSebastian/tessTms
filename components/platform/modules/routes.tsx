"use client";
import { useState } from "react";
import { useTms } from "../store";
import { money, uid } from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Panel, Table, Modal, Field, Notice } from "../ui/primitives";
import { FleetMap } from "../ui/fleet-map";
import { Icon } from "../ui/icon";
export default function Routes() {
  const { state, mutate } = useTms();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageTitle
        title="Útvonalak & flottatérkép"
        description="Tárolt viszonylatok, tervezett távolságok és útvonalköltségek."
      >
        <button className="button primary" onClick={() => setOpen(true)}>
          <Icon name="plus" size={16} />
          Útvonal mentése
        </button>
      </PageTitle>
      <Panel
        title="Közép-európai operáció"
        actions={
          <span className="muted">GPS szolgáltató nincs csatlakoztatva</span>
        }
      >
        <FleetMap />
      </Panel>
      <div className="spaced" />
      <Panel title="Tárolt útvonaltervek">
        <Table
          headers={[
            "Útvonalterv",
            "Viszonylat",
            "Távolság",
            "Tervezett idő",
            "Útdíj",
          ]}
        >
          {state.routes.map((r) => (
            <tr key={r.id}>
              <td className="cell-title">{r.name}</td>
              <td>
                {r.from} → {r.to}
              </td>
              <td>{r.km} km</td>
              <td>
                {Math.floor(r.minutes / 60)} ó {r.minutes % 60} p
              </td>
              <td>{money(r.toll)}</td>
            </tr>
          ))}
        </Table>
      </Panel>
      <Notice>
        A térkép sematikus, a járműhelyzetek mintaadatok. Élő GPS, forgalom és
        kamionos útvonaltervezés szolgáltatói integrációval kapcsolható be.
      </Notice>
      {open ? (
        <Modal title="Útvonalterv rögzítése" onClose={() => setOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                mutate("Útvonalterv mentve", String(f.get("name")), (d) =>
                  d.routes.push({
                    id: uid(),
                    name: String(f.get("name")),
                    from: String(f.get("from")),
                    to: String(f.get("to")),
                    km: Number(f.get("km")),
                    minutes: Number(f.get("minutes")),
                    toll: Number(f.get("toll")),
                  }),
                )
              )
                setOpen(false);
            }}
          >
            <div className="modal-body form-grid">
              {[
                ["name", "Útvonal neve"],
                ["from", "Indulás"],
                ["to", "Érkezés"],
                ["km", "Távolság (km)"],
                ["minutes", "Menetidő (perc)"],
                ["toll", "Útdíj (HUF)"],
              ].map(([key, label], i) => (
                <Field key={key} label={label}>
                  <input
                    name={key}
                    type={i > 2 ? "number" : "text"}
                    min="0"
                    required
                  />
                </Field>
              ))}
            </div>
            <footer className="modal-actions">
              <button className="button primary">Mentés</button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
