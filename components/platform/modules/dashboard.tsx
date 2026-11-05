"use client";
import Link from "next/link";
import { useState } from "react";
import { useTms } from "../store";
import {
  huf,
  money,
  number,
  orderRoute,
  sumRevenue,
  sumCost,
  exchangeRate,
} from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Stat, Panel, StatusBadge, Empty } from "../ui/primitives";
import { FleetMap } from "../ui/fleet-map";
import { Icon } from "../ui/icon";

type Scope = "all" | "active" | "unassigned";
const scopes: { key: Scope; label: string }[] = [
  { key: "all", label: "Teljes állomány" },
  { key: "active", label: "Nyitott fuvarok" },
  { key: "unassigned", label: "Kiosztásra vár" },
];
const stages = [
  { label: "Előkészítés", statuses: ["Új", "Tervezett"], tone: "planning" },
  { label: "Kiosztva", statuses: ["Kiosztva"], tone: "assigned" },
  {
    label: "Folyamatban",
    statuses: ["Felrakodás", "Úton", "Lerakodás"],
    tone: "moving",
  },
  { label: "Dokumentáció", statuses: ["Dokumentáció"], tone: "documents" },
  { label: "Lezárva", statuses: ["Lezárva"], tone: "complete" },
];

export default function Dashboard() {
  const { state, orders, companyId } = useTms();
  const [scope, setScope] = useState<Scope>("all");
  const open = orders.filter((order) => order.status !== "Lezárva");
  const unassigned = open.filter((order) => !order.vehicleId);
  const visible =
    scope === "active" ? open : scope === "unassigned" ? unassigned : orders;
  const revenue = sumRevenue(visible);
  const cost = sumCost(visible);
  const margin = revenue - cost;
  const vehicles = state.vehicles.filter(
    (vehicle) => companyId === "all" || vehicle.companyId === companyId,
  );
  const orderIds = new Set(orders.map((order) => order.id));
  const vehicleIds = new Set(vehicles.map((vehicle) => vehicle.id));
  const incidents = state.incidents.filter(
    (incident) =>
      incident.status === "Nyitott" &&
      (orderIds.has(incident.orderId) || vehicleIds.has(incident.vehicleId)),
  );
  const missingDocs = orders.filter(
    (order) =>
      ["Dokumentáció", "Lezárva"].includes(order.status) &&
      !state.documents.some(
        (document) => document.orderId === order.id && document.type === "CMR",
      ),
  );
  const busyVehicles = new Set(
    state.orders
      .filter((order) =>
        ["Kiosztva", "Felrakodás", "Úton", "Lerakodás"].includes(order.status),
      )
      .map((order) => order.vehicleId)
      .filter(Boolean),
  );
  const busyCount = vehicles.filter((vehicle) =>
    busyVehicles.has(vehicle.id),
  ).length;
  const totalKm = visible.reduce(
    (sum, order) => sum + order.loadedKm + order.emptyKm,
    0,
  );
  const emptyKm = visible.reduce((sum, order) => sum + order.emptyKm, 0);
  const divisionData = [...new Set(visible.map((order) => order.division))]
    .map((division) => {
      const items = visible.filter((order) => order.division === division);
      return {
        division,
        count: items.length,
        revenue: sumRevenue(items),
        cost: sumCost(items),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const chartMax = Math.max(
    1,
    ...divisionData.flatMap((division) => [division.revenue, division.cost]),
  );
  const stagesWithCounts = stages.map((stage) => ({
    ...stage,
    count: visible.filter((order) => stage.statuses.includes(order.status))
      .length,
  }));

  return (
    <>
      <PageTitle
        title="Operációs áttekintés"
        description="Fuvarállomány, kapacitás és a figyelmet igénylő feladatok."
        eyebrow="MŰVELETI KÖZPONT"
      >
        <Link className="button primary" href="/new-order">
          <Icon name="plus" size={17} />
          Új fuvarmegbízás
        </Link>
      </PageTitle>

      <div className="dashboard-viewbar">
        <div
          className="segmented-control"
          role="group"
          aria-label="Műveleti központ állományszűrő"
        >
          {scopes.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={scope === item.key}
              onClick={() => setScope(item.key)}
            >
              {item.label}
              {item.key === "unassigned" ? (
                <span>{unassigned.length}</span>
              ) : null}
            </button>
          ))}
        </div>
        <span className="dashboard-scope-note">
          <Icon name="orders" size={14} /> {visible.length} fuvar a nézetben
        </span>
      </div>

      <div className="stats-grid">
        <Stat
          label="Fuvarmegbízások"
          value={visible.length}
          note={`${visible.filter((order) => order.status !== "Lezárva").length} nyitott a kijelölt állományban`}
          icon="orders"
        />
        <Stat
          label="Fuvarállomány értéke"
          value={money(revenue)}
          note={`Fuvardíjak · EUR átszámítás: ${exchangeRate} HUF`}
          icon="finance"
        />
        <Stat
          label="Várható összesített fedezet"
          value={money(margin)}
          note={`${revenue ? ((margin / revenue) * 100).toLocaleString("hu-HU", { maximumFractionDigits: 1 }) : "0"}% · lezárt fuvaroknál tényköltséggel`}
          icon="chart"
          accent
        />
        <Stat
          label="Flottakapacitás"
          value={
            <>
              {busyCount}
              <span className="stat-denominator"> / {vehicles.length}</span>
            </>
          }
          note={`${vehicles.length - busyCount} jármű nincs folyamatban lévő fuvarhoz rendelve`}
          icon="truck"
        />
      </div>

      <div className="dashboard-grid">
        <Panel
          title="Flotta áttekintés"
          eyebrow="RÖGZÍTETT JÁRMŰPOZÍCIÓK"
          actions={
            <Link className="text-link" href="/routes">
              Útvonalak és térkép <Icon name="arrow" size={14} />
            </Link>
          }
        >
          <FleetMap compact />
        </Panel>
        <Panel
          title="Ami most figyelmet kér"
          eyebrow="OPERÁCIÓS JELZÉSEK"
          className="attention-panel"
          actions={
            <span className="priority-count">
              {incidents.length + unassigned.length + missingDocs.length}
            </span>
          }
        >
          <Link className="attention red" href="/damage">
            <span>
              <Icon name="alert" />
            </span>
            <div>
              <strong>{incidents.length} nyitott műveleti jelzés</strong>
              <p>Incidensek ellenőrzése és beavatkozás</p>
            </div>
            <Icon name="right" size={15} />
          </Link>
          <Link className="attention amber" href="/dispatch">
            <span>
              <Icon name="calendar" />
            </span>
            <div>
              <strong>{unassigned.length} fuvar kiosztásra vár</strong>
              <p>Jármű és sofőr hozzárendelése</p>
            </div>
            <Icon name="right" size={15} />
          </Link>
          <Link className="attention green" href="/documents">
            <span>
              <Icon name="folder" />
            </span>
            <div>
              <strong>{missingDocs.length} hiányzó CMR dokumentum</strong>
              <p>Teljesítéshez tartozó fuvarokmányok pótlása</p>
            </div>
            <Icon name="right" size={15} />
          </Link>
          <div className="attention-footer">
            <Icon name="shield" size={15} />
            <span>A jelzések a kiválasztott cég állományát követik.</span>
          </div>
        </Panel>
      </div>

      <Panel
        title="Fuvarok a folyamatban"
        eyebrow="AZ ÁLLOMÁNY ELOSZLÁSA"
        className="pipeline-panel"
        actions={
          <Link className="text-link" href="/dispatch">
            Diszponálás <Icon name="arrow" size={14} />
          </Link>
        }
      >
        <div className="operation-pipeline">
          {stagesWithCounts.map((stage, index) => (
            <div key={stage.label} className={`pipeline-stage ${stage.tone}`}>
              <div>
                <i />
                <span>{stage.label}</span>
              </div>
              <strong>{stage.count.toString().padStart(2, "0")}</strong>
              <div className="pipeline-track">
                <span
                  style={{
                    width: `${visible.length ? (stage.count / visible.length) * 100 : 0}%`,
                  }}
                />
              </div>
              {index < stagesWithCounts.length - 1 ? (
                <Icon name="right" size={14} />
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Aktuális fuvarok"
        eyebrow="MUNKALISTA"
        actions={
          <Link className="text-link" href="/orders">
            Összes megbízás <Icon name="arrow" size={14} />
          </Link>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Megbízás / partner</th>
                <th scope="col">Útvonal</th>
                <th scope="col">Jármű / sofőr</th>
                <th scope="col">Státusz</th>
                <th scope="col">Fuvardíj</th>
                <th scope="col">Fedezet</th>
                <th scope="col">
                  <span className="sr-only">Részletek</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, 6).map((order) => {
                const orderRevenue = huf(order.price, order.currency);
                const orderCost =
                  order.status === "Lezárva"
                    ? order.actualCost
                    : order.plannedCost;
                const marginPct = orderRevenue
                  ? ((orderRevenue - orderCost) / orderRevenue) * 100
                  : 0;
                return (
                  <tr key={order.id}>
                    <td>
                      <Link
                        className="cell-title"
                        href={`/orders?order=${order.id}`}
                      >
                        {order.reference}
                      </Link>
                      <small>
                        {
                          state.partners.find(
                            (partner) => partner.id === order.partnerId,
                          )?.name
                        }
                      </small>
                    </td>
                    <td>
                      {orderRoute(order)}
                      <small>
                        {number(order.cargo.kg)} kg · {order.cargo.type}
                      </small>
                    </td>
                    <td>
                      {state.vehicles.find(
                        (vehicle) => vehicle.id === order.vehicleId,
                      )?.plate || "Nincs kiosztva"}
                      <small>
                        {state.drivers.find(
                          (driver) => driver.id === order.driverId,
                        )?.name || "Kiosztásra vár"}
                      </small>
                    </td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="numeric">
                      {money(order.price, order.currency)}
                    </td>
                    <td
                      className={`numeric ${marginPct >= 0 ? "positive" : "negative"}`}
                    >
                      {marginPct.toLocaleString("hu-HU", {
                        maximumFractionDigits: 1,
                      })}
                      %
                    </td>
                    <td>
                      <Link
                        href={`/orders?order=${order.id}`}
                        className="icon-link"
                        aria-label={`${order.reference} részletei`}
                      >
                        <Icon name="arrow" size={17} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length ? (
            <Empty
              title="Ebben a nézetben nincs fuvar."
              text="Válassz másik állományszűrőt, vagy rögzíts új megbízást."
            />
          ) : null}
        </div>
      </Panel>

      <div className="dashboard-bottom-grid">
        <Panel
          title="Bevétel és költség üzletáganként"
          eyebrow="FEDEZETI ÁTTEKINTÉS"
          actions={
            <Link className="text-link" href="/analytics">
              Riportok <Icon name="arrow" size={14} />
            </Link>
          }
        >
          {divisionData.length ? (
            <div className="division-chart">
              <div className="chart-legend">
                <span>
                  <i /> Fuvardíj
                </span>
                <span>
                  <i /> Költség
                </span>
                <small>HUF egyenérték</small>
              </div>
              {divisionData.map((division) => (
                <div className="division-chart-row" key={division.division}>
                  <div>
                    <strong>{division.division}</strong>
                    <span>{division.count} fuvar</span>
                    <b>{money(division.revenue - division.cost)} fedezet</b>
                  </div>
                  <div className="division-bars">
                    <div>
                      <span
                        style={{
                          width: `${(division.revenue / chartMax) * 100}%`,
                        }}
                      />
                      <strong>{money(division.revenue)}</strong>
                    </div>
                    <div>
                      <span
                        style={{
                          width: `${(division.cost / chartMax) * 100}%`,
                        }}
                      />
                      <strong>{money(division.cost)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty />
          )}
          <div className="dashboard-efficiency">
            <span>
              <Icon name="route" size={16} />
              <strong>{number(totalKm)} km</strong> tervezett össztáv
            </span>
            <span>
              <strong>
                {totalKm
                  ? ((emptyKm / totalKm) * 100).toLocaleString("hu-HU", {
                      maximumFractionDigits: 1,
                    })
                  : "0"}
                %
              </strong>{" "}
              üresfutás
            </span>
          </div>
        </Panel>
        <Panel
          title="Legutóbbi változások"
          eyebrow="MUNKATÉR ESEMÉNYNAPLÓJA"
          actions={
            <Link className="text-link" href="/settings">
              Napló <Icon name="arrow" size={14} />
            </Link>
          }
        >
          {state.audit.length ? (
            <div className="activity-list">
              {state.audit.slice(0, 4).map((entry) => (
                <div key={entry.id}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{entry.action}</strong>
                    <small>
                      {entry.entity} · {entry.actor}
                    </small>
                  </div>
                  <time dateTime={entry.at}>
                    {new Date(entry.at).toLocaleTimeString("hu-HU", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Budapest",
                    })}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Még nincs naplózott változás." />
          )}
          <Link className="dashboard-ecosystem-link" href="/scan">
            <span>
              <Icon name="scan" size={19} />
            </span>
            <div>
              <strong>Kevesebb papír. Több lendület.</strong>
              <small>scanR dokumentumfeldolgozó munkatér</small>
            </div>
            <Icon name="arrow" size={18} />
          </Link>
        </Panel>
      </div>
    </>
  );
}
