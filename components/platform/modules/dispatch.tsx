"use client";
import { useState } from "react";
import { useTms } from "../store";
import { orderRoute } from "../../../lib/tms/model";
import { assignmentError } from "../../../lib/tms/rules";
import { PageTitle } from "../ui/page-title";
import { Panel, Badge, Empty } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Dispatch() {
  const { state, orders, companyId, assign } = useTms();
  const [date, setDate] = useState("2026-11-05");
  const [selected, setSelected] = useState("");
  const tasks = orders.filter((o) => !o.vehicleId && o.stops[0]?.date === date);
  return (
    <>
      <PageTitle
        title="Diszponálás"
        description="Húzd a megbízást egy járműre, vagy jelöld ki és oszd ki gombbal."
      >
        <input
          type="date"
          aria-label="Tervezési nap"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </PageTitle>
      <div className="dispatch-layout">
        <Panel
          title="Kiosztásra vár"
          actions={<Badge>{tasks.length} fuvar</Badge>}
        >
          <div className="dispatch-backlog">
            {tasks.map((o) => (
              <button
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", o.id);
                  setSelected(o.id);
                }}
                onClick={() => setSelected(o.id)}
                className={`dispatch-task ${selected === o.id ? "selected" : ""}`}
                key={o.id}
              >
                <strong>{o.reference}</strong>
                <p>{orderRoute(o)}</p>
                <small>
                  {o.cargo.kg.toLocaleString("hu-HU")} kg · {o.cargo.type}
                </small>
                {o.cargo.adr ? <Badge tone="amber">ADR</Badge> : null}
              </button>
            ))}
            {!tasks.length ? (
              <Empty
                title="Minden fuvar kiosztva."
                text="Válassz másik napot vagy hozz létre új megbízást."
              />
            ) : null}
          </div>
        </Panel>
        <Panel
          title="Kapacitástábla"
          actions={<span className="muted">Napi foglaltság · {date}</span>}
        >
          <div className="schedule-hours">
            <span>Erőforrás</span>
            <span>06:00</span>
            <span>10:00</span>
            <span>14:00</span>
            <span>18:00</span>
          </div>
          {state.vehicles
            .filter((v) => companyId === "all" || v.companyId === companyId)
            .map((v) => {
              const jobs = orders.filter(
                (o) =>
                  o.vehicleId === v.id &&
                  o.stops[0]?.date === date &&
                  o.status !== "Lezárva",
              );
              const choice = state.orders.find((o) => o.id === selected);
              const err = choice ? assignmentError(state, choice, v.id) : null;
              return (
                <div
                  className="schedule-row"
                  key={v.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    assign(e.dataTransfer.getData("text/plain"), v.id);
                  }}
                >
                  <div className="schedule-resource">
                    <Icon name="truck" />
                    <strong>{v.plate}</strong>
                    <small>
                      {state.drivers.find((d) => d.id === v.driverId)?.name}
                    </small>
                  </div>
                  <div className="schedule-lane">
                    {jobs.length ? (
                      jobs.map((o) => (
                        <div className="schedule-job" key={o.id}>
                          <strong>{o.reference}</strong>
                          <span>{orderRoute(o)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="schedule-free">
                        <span>
                          {selected
                            ? err || "Elérhető a kijelölt fuvarra"
                            : "Szabad kapacitás"}
                        </span>
                        {selected ? (
                          <button
                            className="button small"
                            disabled={!!err}
                            onClick={() => assign(selected, v.id)}
                          >
                            Kiosztás
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </Panel>
      </div>
    </>
  );
}
