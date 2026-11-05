"use client";
import { useState } from "react";
import { useTms } from "../store";
import {
  money,
  sumRevenue,
  sumCost,
  type CompanyId,
} from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Panel, Table, Stat, Modal, Field, Notice } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Group() {
  const { state, companies, mutate } = useTms();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageTitle
        title="Cégcsoportszintű működés"
        description="Konszolidált eredmények és cégek közötti erőforrás-megosztás."
      >
        <button className="button primary" onClick={() => setOpen(true)}>
          <Icon name="truck" size={16} />
          Erőforrás átirányítása
        </button>
      </PageTitle>
      <div className="stats-grid three">
        <Stat
          label="Cégcsoport árbevétele"
          value={money(sumRevenue(state.orders))}
          note="Belső elszámolások eliminálása nélkül"
          icon="building"
        />
        <Stat
          label="Cégcsoport fedezete"
          value={money(sumRevenue(state.orders) - sumCost(state.orders))}
          note="Közös HUF egyenérték"
          icon="chart"
          accent
        />
        <Stat
          label="Megosztható flotta"
          value={state.vehicles.length}
          note={`${companies.length} cég · ${state.drivers.length} sofőr`}
          icon="truck"
        />
      </div>
      <Panel title="Cégek teljesítménye">
        <Table headers={["Cég", "Fuvarok", "Járművek", "Árbevétel", "Fedezet"]}>
          {companies.map((c) => {
            const jobs = state.orders.filter((o) => o.companyId === c.id);
            return (
              <tr key={c.id}>
                <td className="cell-title">{c.name}</td>
                <td>{jobs.length}</td>
                <td>
                  {state.vehicles.filter((v) => v.companyId === c.id).length}
                </td>
                <td>{money(sumRevenue(jobs))}</td>
                <td className="positive">
                  {money(sumRevenue(jobs) - sumCost(jobs))}
                </td>
              </tr>
            );
          })}
        </Table>
      </Panel>
      <div className="spaced" />
      <Panel title="Üzletági konszolidáció">
        <Table headers={["Üzletág", "Fuvarok", "Árbevétel", "Fedezet"]}>
          {Array.from(new Set(state.orders.map((o) => o.division))).map(
            (div) => {
              const list = state.orders.filter((o) => o.division === div);
              return (
                <tr key={div}>
                  <td>{div}</td>
                  <td>{list.length}</td>
                  <td>{money(sumRevenue(list))}</td>
                  <td>{money(sumRevenue(list) - sumCost(list))}</td>
                </tr>
              );
            },
          )}
        </Table>
      </Panel>
      {open ? (
        <Modal
          title="Jármű cégek közötti átirányítása"
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                mutate(
                  "Erőforrás átirányítva",
                  String(f.get("vehicle")),
                  (d) => {
                    const id = String(f.get("vehicle"));
                    if (
                      d.orders.some(
                        (o) =>
                          o.vehicleId === id &&
                          !["Lezárva", "Dokumentáció"].includes(o.status),
                      )
                    )
                      throw new Error(
                        "Aktív fuvaron dolgozó jármű nem irányítható át.",
                      );
                    const v = d.vehicles.find((v) => v.id === id)!;
                    v.companyId = f.get("company") as CompanyId;
                    const driver = d.drivers.find((x) => x.id === v.driverId);
                    if (driver) driver.companyId = v.companyId;
                  },
                )
              )
                setOpen(false);
            }}
          >
            <div className="modal-body stack">
              <Field label="Jármű és hozzárendelt sofőr">
                <select name="vehicle">
                  {state.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fogadó cég">
                <select name="company">
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Notice>
                Az átirányítás helyi eseményt kap. Belső bérvontatási díj és
                transzferár-kimutatás külön pénzügyi illesztést igényel.
              </Notice>
            </div>
            <footer className="modal-actions">
              <button className="button primary">Átirányítás</button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
