"use client";
import { useState } from "react";
import { useTms } from "../store";
import {
  money,
  number,
  uid,
  companies,
  type CompanyId,
} from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import {
  Panel,
  Table,
  StatusBadge,
  Modal,
  Field,
  Badge,
  Progress,
} from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Fleet() {
  const { state, companyId, mutate } = useTms();
  const [open, setOpen] = useState<"vehicle" | "service" | null>(null);
  const vehicles = state.vehicles.filter(
    (v) => companyId === "all" || v.companyId === companyId,
  );
  return (
    <>
      <PageTitle
        title="Flotta & karbantartás"
        description="Járművek, sofőrök, műszaki érvényesség és szervizfolyamatok."
      >
        <button className="button" onClick={() => setOpen("service")}>
          Szervizesemény
        </button>
        <button className="button primary" onClick={() => setOpen("vehicle")}>
          <Icon name="plus" size={16} />
          Új jármű
        </button>
      </PageTitle>
      <div className="vehicle-grid">
        {vehicles.map((v) => (
          <article className="vehicle-card" key={v.id}>
            <div className="vehicle-card-top">
              <span>
                <Icon name="truck" size={27} />
              </span>
              <Badge tone={v.serviceAt - v.km < 2500 ? "amber" : "green"}>
                {v.serviceAt - v.km < 2500 ? "Szerviz közeleg" : "Üzemkész"}
              </Badge>
            </div>
            <h2>{v.plate}</h2>
            <p>{v.model}</p>
            <div className="vehicle-details">
              <span>
                Sofőr
                <strong>
                  {state.drivers.find((d) => d.id === v.driverId)?.name}
                </strong>
              </span>
              <span>
                Futásteljesítmény<strong>{number(v.km)} km</strong>
              </span>
              <span>
                Műszaki érvényes<strong>{v.inspection}</strong>
              </span>
              <span>
                Kapacitás
                <strong>
                  {number(v.capacity)} kg {v.adr ? "· ADR" : ""}
                </strong>
              </span>
            </div>
            <Progress value={(1 - (v.serviceAt - v.km) / 30000) * 100} />
            <small>{number(v.serviceAt - v.km)} km a következő szervizig</small>
          </article>
        ))}
      </div>
      <Panel title="Szervizterv és munkalapok">
        <Table
          headers={[
            "Jármű",
            "Munkalap",
            "Dátum",
            "Költség",
            "Állapot",
            "Művelet",
          ]}
        >
          {state.services
            .filter((s) => vehicles.some((v) => v.id === s.vehicleId))
            .map((s) => (
              <tr key={s.id}>
                <td className="cell-title">
                  {state.vehicles.find((v) => v.id === s.vehicleId)?.plate}
                </td>
                <td>{s.description}</td>
                <td>{s.date}</td>
                <td>{money(s.cost)}</td>
                <td>
                  <StatusBadge status={s.status} />
                </td>
                <td>
                  {s.status !== "Kész" ? (
                    <button
                      className="button small"
                      onClick={() =>
                        mutate("Szervizállapot frissítve", s.id, (d) => {
                          const row = d.services.find((x) => x.id === s.id)!;
                          row.status =
                            row.status === "Tervezett" ? "Műhelyben" : "Kész";
                          if (row.status === "Kész") {
                            const v = d.vehicles.find(
                              (v) => v.id === row.vehicleId,
                            )!;
                            v.serviceAt = v.km + 30000;
                          }
                        })
                      }
                    >
                      {s.status === "Tervezett" ? "Műhelybe" : "Lezárás"}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
        </Table>
      </Panel>
      {open ? (
        <Modal
          title={open === "vehicle" ? "Jármű felvétele" : "Szerviz tervezése"}
          onClose={() => setOpen(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const isVehicle = open === "vehicle";
              if (
                mutate(
                  isVehicle ? "Jármű rögzítve" : "Szerviz tervezve",
                  String(f.get("plate") || f.get("description")),
                  (d) => {
                    if (isVehicle) {
                      const plate = String(f.get("plate")).toUpperCase();
                      if (d.vehicles.some((v) => v.plate === plate))
                        throw new Error("Ez a rendszám már létezik.");
                      d.vehicles.push({
                        id: uid(),
                        plate,
                        model: String(f.get("model")),
                        companyId: f.get("company") as CompanyId,
                        driverId: String(f.get("driver")),
                        trailer: String(f.get("trailer")),
                        capacity: Number(f.get("capacity")),
                        adr: f.get("adr") === "on",
                        lastCity: String(f.get("city")),
                        lat: 47.49,
                        lng: 19.04,
                        km: Number(f.get("km")),
                        serviceAt: Number(f.get("km")) + 30000,
                        inspection: String(f.get("date")),
                      });
                    } else
                      d.services.push({
                        id: uid(),
                        vehicleId: String(f.get("vehicle")),
                        description: String(f.get("description")),
                        date: String(f.get("date")),
                        cost: Number(f.get("cost")),
                        status: "Tervezett",
                      });
                  },
                )
              )
                setOpen(null);
            }}
          >
            <div className="modal-body form-grid">
              {open === "vehicle" ? (
                <>
                  <Field label="Rendszám">
                    <input name="plate" required />
                  </Field>
                  <Field label="Gyártmány / modell">
                    <input name="model" required />
                  </Field>
                  <Field label="Kapacitás (kg)">
                    <input name="capacity" type="number" min="1" required />
                  </Field>
                  <Field label="Kilométeróra">
                    <input name="km" type="number" min="0" required />
                  </Field>
                  <Field label="Cég">
                    <select name="company">
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Sofőr">
                    <select name="driver">
                      {state.drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Pótkocsi">
                    <input name="trailer" required />
                  </Field>
                  <Field label="Utolsó lerakó települése">
                    <input name="city" required />
                  </Field>
                  <Field label="Műszaki érvényessége">
                    <input name="date" type="date" required />
                  </Field>
                  <label className="checkbox-field">
                    <input name="adr" type="checkbox" />
                    ADR képes
                  </label>
                </>
              ) : (
                <>
                  <Field label="Jármű">
                    <select name="vehicle">
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.plate}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Munka leírása">
                    <input name="description" required />
                  </Field>
                  <Field label="Dátum">
                    <input name="date" type="date" required />
                  </Field>
                  <Field label="Költség (HUF)">
                    <input name="cost" type="number" min="0" required />
                  </Field>
                </>
              )}
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
