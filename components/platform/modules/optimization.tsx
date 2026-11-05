"use client";
import { useState } from "react";
import { useTms } from "../store";
import { assignmentError } from "../../../lib/tms/rules";
import { orderRoute } from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Panel, Table, Badge, Notice } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Optimization() {
  const { state, orders, assign } = useTms();
  const [selected, setSelected] = useState("");
  const [goal, setGoal] = useState("distance");
  const open = orders.filter((o) => !o.vehicleId);
  const order = open.find((o) => o.id === selected) || open[0];
  const suggestions = order
    ? state.vehicles
        .map((v) => ({
          v,
          error: assignmentError(state, order, v.id),
          same: v.lastCity === order.stops[0]?.city,
          free: v.capacity - order.cargo.kg,
        }))
        .sort(
          (a, b) =>
            Number(!!a.error) - Number(!!b.error) ||
            (goal === "capacity"
              ? a.free - b.free
              : Number(b.same) - Number(a.same)),
        )
    : [];
  return (
    <>
      <PageTitle
        title="routeR · Kiosztási javaslatok"
        description="Szabályalapú, magyarázható erőforrás-rangsorolás."
      >
        <Icon name="route" size={30} />
      </PageTitle>
      <Notice>
        Helyi heurisztika: kapacitás, ADR, foglaltság és vezetési tartalék
        alapján. A valós menetidő-, CO₂- és útdíj-optimalizáláshoz
        útvonal-szolgáltató és optimalizáló motor szükséges.
      </Notice>
      <div className="toolbar">
        <select
          aria-label="Optimalizálandó fuvar"
          value={order?.id || ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          {open.map((o) => (
            <option key={o.id} value={o.id}>
              {o.reference} · {orderRoute(o)}
            </option>
          ))}
        </select>
        <select
          aria-label="Optimalizálási cél"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        >
          <option value="distance">Azonos induló település előnyben</option>
          <option value="capacity">Legjobb kapacitásilleszkedés</option>
        </select>
      </div>
      <Panel title="Rangsorolt erőforrások">
        <Table
          headers={[
            "Sorrend",
            "Jármű",
            "Előző helyszín",
            "Kapacitás tartalék",
            "Értékelés",
            "Javaslat",
          ]}
        >
          {suggestions.map((s, i) => (
            <tr key={s.v.id}>
              <td>
                <span className="rank">{i + 1}</span>
              </td>
              <td className="cell-title">
                {s.v.plate}
                <small>
                  {state.drivers.find((d) => d.id === s.v.driverId)?.name}
                </small>
              </td>
              <td>
                {s.v.lastCity}
                {s.same ? (
                  <small className="positive">
                    Azonos a felrakó településével
                  </small>
                ) : null}
              </td>
              <td>{s.free.toLocaleString("hu-HU")} kg</td>
              <td>
                {s.error ? (
                  <Badge tone="amber">{s.error}</Badge>
                ) : (
                  <Badge tone="green">Minden demófeltétel teljesül</Badge>
                )}
              </td>
              <td>
                <button
                  className="button small"
                  disabled={!!s.error}
                  onClick={() => order && assign(order.id, s.v.id)}
                >
                  Kiosztás
                </button>
              </td>
            </tr>
          ))}
        </Table>
        {!order ? (
          <div className="form-body">Minden megbízás kiosztva.</div>
        ) : null}
      </Panel>
    </>
  );
}
