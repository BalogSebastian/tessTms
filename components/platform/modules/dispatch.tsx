"use client";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { useTms } from "../store";
import { number, orderRoute, statuses } from "../../../lib/tms/model";
import { assignmentError } from "../../../lib/tms/rules";
import {
  MINUTE,
  clipRange,
  freeRanges,
  overlaps,
  percentRange,
  planOrder,
  planningConflicts,
  planningWindow,
  positionPlans,
  recordedRange,
  shiftPlanningDate,
  type PlanningDays,
  type TimeRange,
} from "../../../lib/tms/planning";
import { Icon } from "../ui/icon";

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const civilTime = (time: number) =>
  new Intl.DateTimeFormat("hu-HU", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
const civilDate = (date: string, weekday = false) =>
  new Intl.DateTimeFormat("hu-HU", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(weekday ? { weekday: "short" } : {}),
  }).format(new Date(`${date}T12:00:00Z`));
const shortReference = (reference: string) =>
  reference.length > 15 ? `…${reference.slice(-12)}` : reference;
const kindLabels = {
  loading: "Felrakás",
  loaded: "Rakott út",
  empty: "Üres út",
  unloading: "Lerakás",
};
const resourceLabels = {
  vehicle: "Jármű",
  driver: "Sofőr",
  trailer: "Pótkocsi",
};
const activeStatus = (status: string) =>
  !["Lezárva", "Dokumentáció"].includes(status);
function rangeStyle(
  range: TimeRange,
  window: TimeRange,
): CSSProperties | undefined {
  const position = percentRange(range, window);
  return position
    ? { left: `${position.left}%`, width: `${position.width}%` }
    : undefined;
}

export default function Dispatch() {
  const { state, orders, companyId, assign, isSaving, user, companies } =
    useTms();
  const [date, setDate] = useState(today);
  const [days, setDays] = useState<PlanningDays>(3);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("all");
  const [status, setStatus] = useState("all");
  const [adrOnly, setAdrOnly] = useState(false);
  const [showBacklog, setShowBacklog] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [handlingMinutes, setHandlingMinutes] = useState(30);
  const [approachKph, setApproachKph] = useState(70);
  const [selectedTask, setSelectedTask] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [dragOver, setDragOver] = useState("");
  const window = useMemo(() => planningWindow(date, days), [date, days]);
  const assumptions = useMemo(
    () => ({ handlingMinutes, approachKph }),
    [handlingMinutes, approachKph],
  );
  const plans = useMemo(
    () =>
      orders
        .filter((order) => activeStatus(order.status))
        .map((order) => planOrder(order, assumptions))
        .filter((plan): plan is NonNullable<typeof plan> =>
          Boolean(plan && overlaps(plan, window)),
        ),
    [orders, assumptions, window],
  );
  const activeOrders = useMemo(
    () => orders.filter((order) => activeStatus(order.status)),
    [orders],
  );
  // Conflict detection uses the entire workspace, so another company's shared driver cannot be hidden by a display filter.
  const allConflicts = useMemo(
    () =>
      planningConflicts(state.orders).filter((conflict) =>
        overlaps(conflict, window),
      ),
    [state.orders, window],
  );
  const matchingVehicles = state.vehicles.filter((vehicle) => {
    if (companyId !== "all" && vehicle.companyId !== companyId) return false;
    if (adrOnly && !vehicle.adr) return false;
    const jobs = plans.filter((plan) => plan.order.vehicleId === vehicle.id);
    if (status !== "all" && !jobs.some((plan) => plan.order.status === status))
      return false;
    if (availability === "free" && jobs.length) return false;
    if (availability === "busy" && !jobs.length) return false;
    if (
      availability === "conflict" &&
      !allConflicts.some((conflict) =>
        [conflict.first.vehicleId, conflict.second.vehicleId].includes(
          vehicle.id,
        ),
      )
    )
      return false;
    const driver = state.drivers.find((item) => item.id === vehicle.driverId);
    const terms =
      `${vehicle.plate} ${vehicle.model} ${vehicle.trailer} ${driver?.name || ""} ${jobs.map((plan) => `${plan.order.reference} ${orderRoute(plan.order)} ${state.partners.find((partner) => partner.id === plan.order.partnerId)?.name || ""}`).join(" ")}`.toLocaleLowerCase(
        "hu-HU",
      );
    return terms.includes(search.toLocaleLowerCase("hu-HU"));
  });
  const visibleIds = new Set(matchingVehicles.map((vehicle) => vehicle.id));
  const visibleConflicts = allConflicts.filter(
    (conflict) =>
      visibleIds.has(conflict.first.vehicleId) ||
      visibleIds.has(conflict.second.vehicleId),
  );
  const conflictOrders = new Set(
    visibleConflicts.flatMap((conflict) => [
      conflict.first.id,
      conflict.second.id,
    ]),
  );
  const unassigned = activeOrders.filter(
    (order) =>
      !order.vehicleId &&
      ["Új", "Tervezett"].includes(order.status) &&
      Boolean(
        recordedRange(order) && overlaps(recordedRange(order)!, window),
      ) &&
      (!adrOnly || order.cargo.adr) &&
      (status === "all" || order.status === status) &&
      `${order.reference} ${orderRoute(order)} ${state.partners.find((partner) => partner.id === order.partnerId)?.name || ""}`
        .toLocaleLowerCase("hu-HU")
        .includes(search.toLocaleLowerCase("hu-HU")),
  );
  const choice = unassigned.find((order) => order.id === selectedTask);
  const focused =
    matchingVehicles.find((vehicle) => vehicle.id === selectedVehicle) ||
    matchingVehicles[0];
  const focusedDriver = state.drivers.find(
    (driver) => driver.id === focused?.driverId,
  );
  const focusedPlans = plans.filter(
    (plan) => plan.order.vehicleId === focused?.id,
  );
  const focusedIncidents = state.incidents.filter(
    (incident) =>
      incident.status === "Nyitott" &&
      (incident.vehicleId === focused?.id ||
        focusedPlans.some((plan) => plan.order.id === incident.orderId)),
  );
  const busyVehicles = matchingVehicles.filter((vehicle) =>
    plans.some((plan) => plan.order.vehicleId === vehicle.id),
  ).length;
  const canEdit = ["admin", "dispatcher"].includes(user.role) && !isSaving;
  const totalDuration = window.end - window.start;
  const ticks = Array.from(
    { length: days * (days === 1 ? 12 : 4) },
    (_, index) => ({
      time: window.start + index * (days === 1 ? 2 : 6) * 60 * MINUTE,
      label: `${String((index * (days === 1 ? 2 : 6)) % 24).padStart(2, "0")}:00`,
    }),
  );
  const minWidth = days === 7 ? 1450 : days === 3 ? 720 : 720;
  const currentCivil = new Date(
    `${today()}T${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date())}:00Z`,
  ).getTime();
  const nowPosition =
    currentCivil >= window.start && currentCivil < window.end
      ? ((currentCivil - window.start) / totalDuration) * 100
      : null;
  function changeDate(value: string) {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setDate(value);
      setSelectedTask("");
    }
  }
  return (
    <div className="planner-ws">
      <header className="planner-titlebar">
        <div>
          <p className="planner-kicker">OPERÁCIÓ / DISZPONÁLÁS</p>
          <h1>
            Járműtervező<span>Diszpécseri munkatér</span>
          </h1>
          <p>A teljes flottád, egy összehangolt idővonalon.</p>
        </div>
        <div className="planner-title-actions">
          <button
            className={`planner-button ${showAssumptions ? "active" : ""}`}
            onClick={() => setShowAssumptions(!showAssumptions)}
          >
            <Icon name="settings" size={15} /> Tervezési beállítások
          </button>
          <Link className="planner-button primary" href="/new-order">
            <Icon name="plus" size={16} /> Új fuvarmegbízás
          </Link>
        </div>
      </header>
      <div className="planner-toolbar">
        <div className="planner-search">
          <Icon name="search" size={16} />
          <input
            aria-label="Keresés a járműtervezőben"
            placeholder="Jármű, sofőr, rendszám vagy fuvarszám…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search ? (
            <button aria-label="Keresés törlése" onClick={() => setSearch("")}>
              <Icon name="close" size={13} />
            </button>
          ) : null}
        </div>
        <label className="planner-filter">
          <span>Kapacitás</span>
          <select
            aria-label="Kapacitásszűrő"
            value={availability}
            onChange={(event) => setAvailability(event.target.value)}
          >
            <option value="all">Minden jármű</option>
            <option value="free">Szabad a teljes időszakban</option>
            <option value="busy">Tervezett fuvarral</option>
            <option value="conflict">Ütközéssel érintett</option>
          </select>
        </label>
        <label className="planner-filter">
          <span>Fuvarstátusz</span>
          <select
            aria-label="Tervező fuvarstátusz"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">Minden státusz</option>
            {statuses.filter(activeStatus).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="planner-adr">
          <input
            type="checkbox"
            checked={adrOnly}
            onChange={(event) => setAdrOnly(event.target.checked)}
          />{" "}
          ADR
        </label>
      </div>
      {showAssumptions ? (
        <section className="planner-assumptions">
          <div>
            <strong>Tervezési feltételezések</strong>
            <p>
              A színezett szakaszok a rögzített rakodási időpontokból és az itt
              megadott feltételezésekből készülnek. Nem GPS- vagy
              tachográfadatok, és nem módosítják a megbízást.
            </p>
          </div>
          <label>
            Rakodási idő / megálló
            <input
              type="number"
              min={0}
              max={240}
              value={handlingMinutes}
              onChange={(event) =>
                setHandlingMinutes(
                  Math.max(0, Math.min(240, Number(event.target.value) || 0)),
                )
              }
            />
            <span>perc</span>
          </label>
          <label>
            Üres megközelítés tervezési sebessége
            <input
              type="number"
              min={10}
              max={130}
              value={approachKph}
              onChange={(event) =>
                setApproachKph(
                  Math.max(10, Math.min(130, Number(event.target.value) || 70)),
                )
              }
            />
            <span>km/h</span>
          </label>
        </section>
      ) : null}
      <div className="planner-commandbar">
        <div className="planner-view-tabs" aria-label="Tervezési időtáv">
          {([1, 3, 7] as const).map((value) => (
            <button
              key={value}
              aria-pressed={days === value}
              className={days === value ? "active" : ""}
              onClick={() => setDays(value)}
            >
              {value === 1 ? "Nap" : value === 3 ? "3 nap" : "Hét"}
            </button>
          ))}
        </div>
        <div className="planner-date-navigation">
          <button
            aria-label="Előző időszak"
            onClick={() => changeDate(shiftPlanningDate(date, -days))}
          >
            <Icon name="back" size={15} />
          </button>
          <input
            type="date"
            aria-label="Tervezési időszak kezdete"
            value={date}
            onChange={(event) => changeDate(event.target.value)}
          />
          <button
            aria-label="Következő időszak"
            onClick={() => changeDate(shiftPlanningDate(date, days))}
          >
            <Icon name="right" size={15} />
          </button>
          <button className="planner-today" onClick={() => changeDate(today())}>
            Ma
          </button>
        </div>
        <div className="planner-counters">
          <span>
            <i className="busy" />
            {busyVehicles} tervezett
          </span>
          <span>
            <i className="free" />
            {matchingVehicles.length - busyVehicles} szabad
          </span>
          <span className={visibleConflicts.length ? "has-conflict" : ""}>
            <Icon name="alert" size={13} />
            {visibleConflicts.length} ütközés
          </span>
        </div>
        <button
          className={`planner-button planner-backlog-toggle ${showBacklog ? "active" : ""}`}
          onClick={() => setShowBacklog(!showBacklog)}
          aria-expanded={showBacklog}
        >
          <Icon name="orders" size={15} /> Kiosztatlan{" "}
          <b>{unassigned.length}</b>
          <Icon name="down" size={13} />
        </button>
      </div>
      {showBacklog ? (
        <section
          className="planner-backlog"
          aria-label="Kiosztatlan megbízások"
        >
          <div className="planner-backlog-heading">
            <strong>Kiosztásra váró megbízások</strong>
            <span>
              Húzd a jármű sorára, vagy jelöld ki és használd a Kiosztás gombot.
            </span>
            {choice ? (
              <button onClick={() => setSelectedTask("")}>
                Kijelölés törlése
              </button>
            ) : null}
          </div>
          <div className="planner-backlog-items">
            {unassigned.map((order) => (
              <button
                key={order.id}
                className={`planner-backlog-card ${selectedTask === order.id ? "selected" : ""}`}
                aria-pressed={selectedTask === order.id}
                draggable={canEdit}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", order.id);
                  setSelectedTask(order.id);
                }}
                onClick={() => setSelectedTask(order.id)}
              >
                <strong>
                  {order.reference}
                  {order.cargo.adr ? <b>ADR</b> : null}
                </strong>
                <span>{orderRoute(order)}</span>
                <small>
                  {civilDate(order.stops[0].date)} · {order.stops[0].time} ·{" "}
                  {number(order.cargo.kg)} kg
                </small>
                <span className="planner-backlog-partner">
                  {
                    state.partners.find(
                      (partner) => partner.id === order.partnerId,
                    )?.name
                  }
                </span>
              </button>
            ))}
            {!unassigned.length ? (
              <p className="planner-backlog-empty">
                <Icon name="check" size={18} /> Nincs kiosztatlan megbízás a
                kiválasztott időszakban.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
      <div className="planner-layout">
        <section className="planner-board" aria-label="Flotta idővonal">
          <div className="planner-board-heading">
            <div>
              <strong>Flotta idővonal</strong>
              <span>
                {matchingVehicles.length} jármű · {civilDate(date)}
                {days > 1
                  ? ` – ${civilDate(shiftPlanningDate(date, days - 1))}`
                  : ""}
              </span>
            </div>
            <span className="planner-axis-note">
              <Icon name="clock" size={13} /> Helyi rakodási időpontok
            </span>
          </div>
          <div className="planner-scroll">
            <div className="planner-grid" style={{ minWidth }}>
              <div className="planner-grid-heading">
                <div className="planner-resource-heading">
                  JÁRMŰ / SOFŐR / PÓTKOCSI
                </div>
                <div className="planner-calendar-heading">
                  <div className="planner-days">
                    {window.dates.map((day) => (
                      <div
                        key={day}
                        className={day === today() ? "today" : ""}
                        style={{ width: `${100 / days}%` }}
                      >
                        <strong>{civilDate(day, true)}</strong>
                        {day === today() ? <span>MA</span> : null}
                      </div>
                    ))}
                  </div>
                  <div className="planner-hours">
                    {ticks.map((tick) => (
                      <span
                        key={tick.time}
                        style={{
                          left: `${((tick.time - window.start) / totalDuration) * 100}%`,
                        }}
                      >
                        {tick.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {matchingVehicles.map((vehicle) => {
                const jobs = plans.filter(
                  (plan) => plan.order.vehicleId === vehicle.id,
                );
                const positioned = positionPlans(jobs);
                const available = freeRanges(jobs, window);
                const driver = state.drivers.find(
                  (item) => item.id === vehicle.driverId,
                );
                const rowConflict = visibleConflicts.some(
                  (conflict) =>
                    conflict.first.vehicleId === vehicle.id ||
                    conflict.second.vehicleId === vehicle.id,
                );
                const assignment = choice
                  ? assignmentError(state, choice, vehicle.id)
                  : null;
                const rowHeight = Math.max(88, positioned.lanes * 68 + 12);
                return (
                  <div
                    key={vehicle.id}
                    className={`planner-resource-row ${focused?.id === vehicle.id ? "selected" : ""} ${rowConflict ? "conflicted" : ""} ${dragOver === vehicle.id ? "drop-target" : ""}`}
                    style={{ minHeight: rowHeight }}
                    onDragOver={(event) => {
                      if (canEdit) {
                        event.preventDefault();
                        setDragOver(vehicle.id);
                      }
                    }}
                    onDragLeave={() => setDragOver("")}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragOver("");
                      if (canEdit)
                        assign(
                          event.dataTransfer.getData("text/plain"),
                          vehicle.id,
                        );
                    }}
                  >
                    <button
                      className="planner-resource"
                      onClick={() => setSelectedVehicle(vehicle.id)}
                      aria-pressed={focused?.id === vehicle.id}
                    >
                      <span className="planner-truck-icon">
                        <Icon name="truck" size={22} />
                      </span>
                      <span className="planner-resource-copy">
                        <strong>
                          {vehicle.plate}
                          {rowConflict ? <Icon name="alert" size={13} /> : null}
                        </strong>
                        <span>{driver?.name || "Nincs sofőr"}</span>
                        <small>
                          {vehicle.trailer || "Nincs pótkocsi"} ·{" "}
                          {number(vehicle.capacity / 1000)} t
                          {vehicle.adr ? " · ADR" : ""}
                        </small>
                      </span>
                      <i className={jobs.length ? "busy" : "free"} />
                    </button>
                    <div
                      className="planner-track"
                      style={{ minHeight: rowHeight }}
                      onClick={() => setSelectedVehicle(vehicle.id)}
                    >
                      <div className="planner-track-grid">
                        {ticks.map((tick) => (
                          <i
                            key={tick.time}
                            style={{
                              left: `${((tick.time - window.start) / totalDuration) * 100}%`,
                            }}
                            className={
                              civilTime(tick.time) === "00:00"
                                ? "day-boundary"
                                : ""
                            }
                          />
                        ))}
                      </div>
                      {available.map((range) => (
                        <div
                          className="planner-free-range"
                          key={range.start}
                          style={rangeStyle(range, window)}
                        >
                          {(range.end - range.start) / totalDuration > 0.18 ? (
                            <span>Szabad kapacitás</span>
                          ) : null}
                        </div>
                      ))}
                      {nowPosition !== null ? (
                        <div
                          className="planner-now"
                          style={{ left: `${nowPosition}%` }}
                        >
                          <i />
                        </div>
                      ) : null}
                      {positioned.items.map(({ plan, lane }) => {
                        const position = percentRange(plan, window);
                        if (!position) return null;
                        const conflicted = conflictOrders.has(plan.order.id);
                        const title = `${plan.order.reference} · ${orderRoute(plan.order)}\n${plan.order.stops[0].date} ${plan.order.stops[0].time} – ${plan.order.stops.at(-1)!.date} ${plan.order.stops.at(-1)!.time}\n${plan.segments.map((segment) => `${segment.label}: ${civilTime(segment.start)}–${civilTime(segment.end)} (tervezés)`).join("\n")}${conflicted ? "\nFIGYELEM: ütköző erőforrás-foglalás" : ""}`;
                        return (
                          <Link
                            key={plan.order.id}
                            className={`planner-event ${conflicted ? "conflict" : ""}`}
                            href={`/orders?order=${encodeURIComponent(plan.order.id)}`}
                            title={title}
                            aria-label={`${plan.order.reference}, ${orderRoute(plan.order)}, ${conflicted ? "erőforrás-ütközés, " : ""}megbízás megnyitása`}
                            style={{
                              left: `${position.left}%`,
                              width: `${position.width}%`,
                              top: 15 + lane * 68,
                            }}
                          >
                            <div className="planner-event-caption">
                              <strong>
                                {shortReference(
                                  days > 1 && plan.order.reference.length > 10
                                    ? `…${plan.order.reference.slice(-9)}`
                                    : plan.order.reference,
                                )}
                              </strong>
                              {conflicted ? (
                                <Icon name="alert" size={11} />
                              ) : null}
                            </div>
                            <div className="planner-event-segments">
                              {plan.segments.map((segment) => {
                                const clipped = clipRange(segment, window),
                                  full = clipRange(plan, window);
                                if (!clipped || !full) return null;
                                return (
                                  <span
                                    key={segment.id}
                                    className={`planner-segment ${segment.kind} ${segment.estimated ? "estimated" : ""}`}
                                    title={`${segment.label} · ${segment.note}`}
                                    style={{
                                      left: `${((clipped.start - full.start) / (full.end - full.start)) * 100}%`,
                                      width: `${((clipped.end - clipped.start) / (full.end - full.start)) * 100}%`,
                                    }}
                                  >
                                    {segment.kind === "loaded" &&
                                    position.width > 10 ? (
                                      <span>
                                        {plan.order.stops[0].city} →{" "}
                                        {plan.order.stops.at(-1)?.city}
                                      </span>
                                    ) : null}
                                  </span>
                                );
                              })}
                            </div>
                            <span className="planner-event-time">
                              {civilTime(plan.recorded.start)} –{" "}
                              {civilTime(plan.recorded.end)}
                            </span>
                          </Link>
                        );
                      })}
                      {choice ? (
                        <div className="planner-row-assignment">
                          <span className={assignment ? "invalid" : "valid"}>
                            {assignment || `${choice.reference} kiosztható`}
                          </span>
                          <button
                            disabled={!canEdit || Boolean(assignment)}
                            onClick={(event) => {
                              event.stopPropagation();
                              assign(choice.id, vehicle.id);
                            }}
                          >
                            Kiosztás <Icon name="plus" size={11} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {!matchingVehicles.length ? (
                <div className="planner-empty">
                  <Icon name="truck" size={32} />
                  <strong>Nincs a szűrésnek megfelelő jármű.</strong>
                  <p>
                    {state.vehicles.length
                      ? "Módosítsd a keresést vagy a kapacitásszűrőt."
                      : "A Flotta és szerviz modulban rögzítheted az első járművet."}
                  </p>
                  {search ||
                  availability !== "all" ||
                  adrOnly ||
                  status !== "all" ? (
                    <button
                      className="planner-button"
                      onClick={() => {
                        setSearch("");
                        setAvailability("all");
                        setAdrOnly(false);
                        setStatus("all");
                      }}
                    >
                      Szűrők törlése
                    </button>
                  ) : (
                    <Link href="/fleet" className="planner-button">
                      Flotta megnyitása <Icon name="arrow" size={14} />
                    </Link>
                  )}
                </div>
              ) : null}
            </div>
          </div>
          <footer className="planner-legend">
            <div>
              {Object.entries(kindLabels).map(([kind, label]) => (
                <span key={kind}>
                  <i className={kind} />
                  {label}
                </span>
              ))}
              <span>
                <i className="free" />
                Szabad
              </span>
              <span>
                <i className="conflict" />
                Ütközés
              </span>
            </div>
            <button onClick={() => setShowAssumptions(!showAssumptions)}>
              <Icon name="settings" size={12} /> Rakodási szakaszok: tervezési
              feltételezés · {handlingMinutes} perc
            </button>
            <p>
              A satírozott szakaszok becsült tervezési ablakok. Üres
              megközelítés: {approachKph} km/h feltételezéssel. Az ütközések a
              rögzített időpontokat vizsgálják.
            </p>
          </footer>
        </section>
        <aside
          className="planner-insights"
          aria-label="Diszpécseri figyelmeztetések és járműrészletek"
        >
          <section
            className={`planner-attention ${visibleConflicts.length ? "has-alert" : ""}`}
          >
            <header>
              <Icon name="alert" size={15} />
              <h2>Figyelmet igényel</h2>
              <b>{visibleConflicts.length + focusedIncidents.length}</b>
            </header>
            {visibleConflicts.length ? (
              <div className="planner-conflict-list">
                {visibleConflicts.map((conflict) => (
                  <article key={conflict.id}>
                    <strong>
                      {conflict.resources
                        .map((resource) => resourceLabels[resource])
                        .join(" / ")}{" "}
                      ütközés
                    </strong>
                    <span>
                      {civilDate(
                        new Date(conflict.start).toISOString().slice(0, 10),
                      )}{" "}
                      · {civilTime(conflict.start)}–{civilTime(conflict.end)}
                    </span>
                    <Link
                      href={`/orders?order=${encodeURIComponent(conflict.first.id)}`}
                    >
                      {conflict.first.reference} <Icon name="arrow" size={11} />
                    </Link>
                    <Link
                      href={`/orders?order=${encodeURIComponent(conflict.second.id)}`}
                    >
                      {conflict.second.reference}{" "}
                      <Icon name="arrow" size={11} />
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
              <div className="planner-all-clear">
                <span>
                  <Icon name="check" size={18} />
                </span>
                <strong>Nincs erőforrás-ütközés</strong>
                <p>
                  A kiválasztott időszak rögzített foglalásai nem fedik át
                  egymást.
                </p>
              </div>
            )}
            {focusedIncidents.map((incident) => (
              <Link
                key={incident.id}
                className="planner-incident"
                href="/damage"
              >
                <Icon name="alert" size={13} />
                <span>
                  {incident.description}
                  <small>Nyitott műveleti jelzés</small>
                </span>
                <Icon name="right" size={12} />
              </Link>
            ))}
          </section>
          {focused ? (
            <section className="planner-focus">
              <header>
                <div>
                  <span className="planner-focus-label">
                    KIJELÖLT ERŐFORRÁS
                  </span>
                  <h2>{focused.plate}</h2>
                </div>
                <span
                  className={`planner-resource-pill ${focusedPlans.length ? "busy" : "free"}`}
                >
                  {focusedPlans.length ? "Tervezett" : "Szabad"}
                </span>
              </header>
              <div className="planner-focus-model">
                <Icon name="truck" size={30} />
                <div>
                  <strong>{focused.model}</strong>
                  <span>
                    {
                      companies.find(
                        (company) => company.id === focused.companyId,
                      )?.name
                    }
                  </span>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Sofőr</dt>
                  <dd>{focusedDriver?.name || "Nincs hozzárendelve"}</dd>
                </div>
                <div>
                  <dt>Pótkocsi</dt>
                  <dd>{focused.trailer || "Nincs megadva"}</dd>
                </div>
                <div>
                  <dt>Raksúly</dt>
                  <dd>{number(focused.capacity)} kg</dd>
                </div>
                <div>
                  <dt>Utolsó rögzített hely</dt>
                  <dd>{focused.lastCity}</dd>
                </div>
                <div>
                  <dt>Vezetési tartalék</dt>
                  <dd>
                    {focusedDriver?.drivingMinutes ?? "–"} perc{" "}
                    <small>Kézi tervezési adat</small>
                  </dd>
                </div>
              </dl>
              <div className="planner-focus-jobs">
                <strong>
                  Feladatok az időszakban <b>{focusedPlans.length}</b>
                </strong>
                {focusedPlans.map((plan) => (
                  <Link
                    key={plan.order.id}
                    href={`/orders?order=${encodeURIComponent(plan.order.id)}`}
                  >
                    <i
                      className={
                        conflictOrders.has(plan.order.id)
                          ? "conflict"
                          : "loaded"
                      }
                    />
                    <div>
                      <strong>{plan.order.reference}</strong>
                      <span>{orderRoute(plan.order)}</span>
                      <small>
                        {civilDate(plan.order.stops[0].date)} ·{" "}
                        {plan.order.stops[0].time} –{" "}
                        {plan.order.stops.at(-1)?.time}
                      </small>
                    </div>
                    <Icon name="right" size={13} />
                  </Link>
                ))}
                {!focusedPlans.length ? (
                  <p>Nincs feladat a kiválasztott időszakban.</p>
                ) : null}
              </div>
              {choice ? (
                <div className="planner-focus-assignment">
                  <span>
                    {assignmentError(state, choice, focused.id) ||
                      `${choice.reference} kiosztható erre a járműre.`}
                  </span>
                  <button
                    className="planner-button primary"
                    disabled={
                      !canEdit ||
                      Boolean(assignmentError(state, choice, focused.id))
                    }
                    onClick={() => assign(choice.id, focused.id)}
                  >
                    Megbízás kiosztása
                  </button>
                </div>
              ) : null}
              <Link href="/fleet" className="planner-focus-link">
                Flottaadatok megnyitása <Icon name="arrow" size={12} />
              </Link>
            </section>
          ) : null}
          <div className="planner-help">
            <Icon name="driver" size={17} />
            <p>
              <strong>Minden részlet egy kattintásra.</strong>A fuvar sávjára
              kattintva közvetlenül megnyílik a szerkeszthető megbízás.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
