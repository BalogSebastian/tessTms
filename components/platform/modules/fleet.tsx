"use client";
import { useState, type FormEvent } from "react";
import { useTms } from "../store";
import { money, number, uid, type CompanyId } from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Panel, Table, StatusBadge, Modal, Field, Badge, Progress, Empty, Stat, Notice } from "../ui/primitives";
import { Icon } from "../ui/icon";

type FormKind = "vehicle" | "driver" | "service";
const normalizedPlate = (plate: string) => plate.toUpperCase().replace(/[\s-]/g, "");

export default function Fleet() {
  const { state, companies, companyId, user, isSaving, mutateAsync } = useTms();
  const [open, setOpen] = useState<FormKind | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<CompanyId>(() => companies[0]?.id || "");
  const canEdit = user.role === "admin" || user.role === "dispatcher";
  const vehicles = state.vehicles.filter((vehicle) => companyId === "all" || vehicle.companyId === companyId);
  const drivers = state.drivers.filter((driver) => companyId === "all" || driver.companyId === companyId);
  const availableDrivers = state.drivers.filter((driver) => driver.companyId === selectedCompany);
  const services = state.services.filter((service) => vehicles.some((vehicle) => vehicle.id === service.vehicleId));
  const busy = pending || isSaving;
  function show(kind: FormKind) {
    setFormError("");
    setSelectedCompany(companyId === "all" ? companies[0]?.id || "" : companyId);
    setOpen(kind);
  }
  function close(event?: { preventDefault(): void }) { if (pending) event?.preventDefault(); else setOpen(null); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!open || busy || !canEdit) return;
    const kind = open;
    const form = new FormData(event.currentTarget);
    const company = form.get("company") as CompanyId;
    const label = String(form.get("plate") || form.get("name") || form.get("description")).trim();
    setPending(true);
    setFormError("");
    const ok = await mutateAsync(
      kind === "vehicle" ? "Jármű rögzítve" : kind === "driver" ? "Sofőr rögzítve" : "Szerviz tervezve",
      label,
      (draft) => {
        if (kind === "driver") {
          const name = String(form.get("name")).trim();
          const phone = String(form.get("phone")).trim();
          if (!name || !phone) throw new Error("A sofőr neve és telefonszáma kötelező.");
          draft.drivers.push({ id: uid(), name, phone, companyId: company, drivingMinutes: Number(form.get("drivingMinutes")), adr: form.get("adr") === "on" });
        } else if (kind === "vehicle") {
          const plate = String(form.get("plate")).trim().toUpperCase();
          if (draft.vehicles.some((vehicle) => normalizedPlate(vehicle.plate) === normalizedPlate(plate))) throw new Error("Ez a rendszám már szerepel a flottában.");
          const driver = draft.drivers.find((item) => item.id === form.get("driver") && item.companyId === company);
          if (!driver) throw new Error("Válassz a jármű cégéhez tartozó sofőrt.");
          const km = Number(form.get("km"));
          const serviceAt = Number(form.get("serviceAt"));
          if (serviceAt < km) throw new Error("A következő szerviz kilométerállása nem lehet kisebb a jelenlegi óraállásnál.");
          draft.vehicles.push({
            id: uid(), plate, model: String(form.get("model")).trim(), companyId: company,
            driverId: driver.id, trailer: String(form.get("trailer")).trim().toUpperCase(),
            capacity: Number(form.get("capacity")), adr: form.get("adr") === "on",
            lastCity: String(form.get("city")).trim(), lat: Number(form.get("lat")), lng: Number(form.get("lng")),
            km, serviceAt, inspection: String(form.get("date")),
          });
        } else {
          const vehicleId = String(form.get("vehicle"));
          if (!draft.vehicles.some((vehicle) => vehicle.id === vehicleId)) throw new Error("Válassz érvényes járművet.");
          draft.services.push({ id: uid(), vehicleId, description: String(form.get("description")).trim(), date: String(form.get("date")), cost: Number(form.get("cost")), status: "Tervezett" });
        }
      },
    );
    setPending(false);
    if (ok) setOpen(null);
    else setFormError("A mentés nem sikerült. Ellenőrizd az értesítésben jelzett hibát; a kitöltött adataid megmaradtak.");
  }
  async function advanceService(id: string) {
    if (busy || !canEdit) return;
    setPending(true);
    await mutateAsync("Szervizállapot frissítve", id, (draft) => {
      const row = draft.services.find((service) => service.id === id);
      if (!row || row.status === "Kész") throw new Error("A munkalap már lezárult vagy nem található.");
      row.status = row.status === "Tervezett" ? "Műhelyben" : "Kész";
    });
    setPending(false);
  }
  return (
    <>
      <PageTitle title="Flotta & karbantartás" description="Járművek, sofőrök és szervizfolyamatok egy közös nyilvántartásban.">
        {canEdit ? <>
          <button className="button" disabled={busy || !vehicles.length} onClick={() => show("service")}><Icon name="settings" size={16} />Szervizesemény</button>
          <button className="button" disabled={busy || !companies.length} onClick={() => show("driver")}><Icon name="users" size={16} />Új sofőr</button>
          <button className="button primary" disabled={busy || !state.drivers.length} onClick={() => show("vehicle")}><Icon name="plus" size={16} />Új jármű</button>
        </> : null}
      </PageTitle>
      <div className="stats-grid three">
        <Stat label="Nyilvántartott járművek" value={vehicles.length} note={`${vehicles.filter((vehicle) => vehicle.adr).length} ADR-képes jármű`} icon="truck" accent />
        <Stat label="Sofőrállomány" value={drivers.length} note={`${drivers.filter((driver) => driver.adr).length} ADR-képes sofőr`} icon="users" />
        <Stat label="Nyitott munkalapok" value={services.filter((service) => service.status !== "Kész").length} note="Tervezett és műhelyben lévő feladatok" icon="settings" />
      </div>
      {!state.drivers.length ? <Notice>Az első jármű előtt rögzíts egy sofőrt az „Új sofőr” gombbal. Ezután a jármű és a sofőr együtt osztható ki fuvarra.</Notice> : null}
      <div className="vehicle-grid">
        {vehicles.map((vehicle) => {
          const inWorkshop = services.some((service) => service.vehicleId === vehicle.id && service.status === "Műhelyben");
          const serviceSoon = vehicle.serviceAt - vehicle.km < 2500;
          return <article className="vehicle-card" key={vehicle.id}>
            <div className="vehicle-card-top"><span><Icon name="truck" size={27} /></span><Badge tone={inWorkshop || serviceSoon ? "amber" : "green"}>{inWorkshop ? "Műhelyben" : serviceSoon ? "Szerviz közeleg" : "Nyilvántartva"}</Badge></div>
            <h2>{vehicle.plate}</h2><p>{vehicle.model}</p>
            <div className="vehicle-details">
              <span>Sofőr<strong>{state.drivers.find((driver) => driver.id === vehicle.driverId)?.name}</strong></span>
              <span>Futásteljesítmény<strong>{number(vehicle.km)} km</strong></span>
              <span>Műszaki érvényes<strong>{vehicle.inspection}</strong></span>
              <span>Kapacitás<strong>{number(vehicle.capacity)} kg {vehicle.adr ? "· ADR" : ""}</strong></span>
              <span>Rögzített hely<strong>{vehicle.lastCity}</strong></span>
            </div>
            <Progress value={Math.max(0, Math.min(100, (1 - (vehicle.serviceAt - vehicle.km) / 30000) * 100))} />
            <small>{number(vehicle.serviceAt - vehicle.km)} km a rögzített szervizhatárig</small>
          </article>;
        })}
      </div>
      {!vehicles.length ? <Panel title="A flottád itt kezdődik"><Empty title="Még nincs jármű ebben a nézetben." text="Rögzíts sofőrt, majd add hozzá a vontató és a pótkocsi adatait." /></Panel> : null}
      <div className="spaced" />
      <Panel title="Sofőrállomány" eyebrow="ERŐFORRÁS-NYILVÁNTARTÁS">
        <Table headers={["Sofőr", "Elérhetőség", "Cég", "Hozzárendelt jármű", "Vezetési tartalék", "Képesítés"]}>
          {drivers.map((driver) => <tr key={driver.id}>
            <td className="cell-title">{driver.name}</td><td><a href={`tel:${driver.phone.replace(/[^+\d]/g, "")}`}>{driver.phone}</a></td>
            <td>{companies.find((company) => company.id === driver.companyId)?.name}</td>
            <td>{state.vehicles.filter((vehicle) => vehicle.driverId === driver.id).map((vehicle) => vehicle.plate).join(", ") || "Még nincs hozzárendelve"}</td>
            <td>{number(driver.drivingMinutes)} perc<small>Rögzített tervezési adat</small></td>
            <td><Badge tone={driver.adr ? "green" : "neutral"}>{driver.adr ? "ADR" : "Általános"}</Badge></td>
          </tr>)}
        </Table>
        {!drivers.length ? <Empty title="Még nincs sofőr ebben a nézetben." text="Az Új sofőr gombbal felveheted az első munkatársat." /> : null}
      </Panel>
      <div className="spaced" />
      <Panel title="Szervizterv és munkalapok">
        <Table headers={["Jármű", "Munkalap", "Dátum", "Költség", "Állapot", "Művelet"]}>
          {services.map((service) => <tr key={service.id}>
            <td className="cell-title">{state.vehicles.find((vehicle) => vehicle.id === service.vehicleId)?.plate}</td>
            <td>{service.description}</td><td>{service.date}</td><td>{money(service.cost)}</td><td><StatusBadge status={service.status} /></td>
            <td>{canEdit && service.status !== "Kész" ? <button className="button small" disabled={busy} onClick={() => void advanceService(service.id)}>{service.status === "Tervezett" ? "Műhelybe" : "Lezárás"}</button> : null}</td>
          </tr>)}
        </Table>
        {!services.length ? <Empty title="Nincs rögzített szervizfeladat." text="A szervizesemények járműhöz kapcsolva kerülnek a munkatervbe." /> : null}
      </Panel>
      {open ? <Modal title={open === "vehicle" ? "Jármű felvétele" : open === "driver" ? "Sofőr felvétele" : "Szerviz tervezése"} onClose={close} wide>
        <form onSubmit={(event) => void save(event)} aria-busy={pending}>
          <div className="modal-body">
            {formError ? <p className="negative" role="alert">{formError}</p> : null}
            <fieldset disabled={pending} className="form-grid" style={{border: 0, padding: 0, margin: 0}}>
              {open === "driver" ? <>
                <Field label="Sofőr teljes neve"><input name="name" autoComplete="name" maxLength={100} required /></Field>
                <Field label="Telefonszám"><input name="phone" type="tel" autoComplete="tel" maxLength={40} placeholder="+36 …" required /></Field>
                <Field label="Cég"><select name="company" defaultValue={selectedCompany} required>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
                <Field label="Megadott vezetési tartalék (perc)" hint="Kézi tervezési adat. A tachográfadatok és a vezetési szabályok külön ellenőrzendők."><input name="drivingMinutes" type="number" min="0" max="1440" step="1" required /></Field>
                <label className="checkbox-field"><input name="adr" type="checkbox" />ADR-képesítéssel rendelkezik</label>
              </> : open === "vehicle" ? <>
                <Field label="Rendszám"><input name="plate" maxLength={20} required /></Field>
                <Field label="Gyártmány / modell"><input name="model" maxLength={100} required /></Field>
                <Field label="Kapacitás (kg)"><input name="capacity" type="number" min="1" step="1" required /></Field>
                <Field label="Kilométeróra (km)"><input name="km" type="number" min="0" step="1" required /></Field>
                <Field label="Következő szerviz óraállása (km)"><input name="serviceAt" type="number" min="0" step="1" required /></Field>
                <Field label="Cég"><select name="company" value={selectedCompany} onChange={(event) => setSelectedCompany(event.target.value as CompanyId)} required>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
                <Field label="Hozzárendelt sofőr" hint={!availableDrivers.length ? "Ehhez a céghez előbb sofőrt kell rögzíteni." : undefined}><select name="driver" key={selectedCompany} required defaultValue=""><option value="" disabled>Válassz sofőrt</option>{availableDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></Field>
                <Field label="Pótkocsi rendszáma"><input name="trailer" maxLength={20} required /></Field>
                <Field label="Utolsó rögzített település"><input name="city" maxLength={100} required /></Field>
                <Field label="Műszaki érvényessége"><input name="date" type="date" required /></Field>
                <Field label="Rögzített szélesség (latitude)" hint="Kézzel rögzített térképi hely, nem élő GPS. Tizedes ponttal, például 47.5."><input name="lat" type="number" step="any" min="-90" max="90" required /></Field>
                <Field label="Rögzített hosszúság (longitude)" hint="WGS84 koordináta. Tizedes ponttal, például 19.1."><input name="lng" type="number" step="any" min="-180" max="180" required /></Field>
                <label className="checkbox-field"><input name="adr" type="checkbox" />ADR-képes jármű</label>
              </> : <>
                <Field label="Jármű"><select name="vehicle" required defaultValue=""><option value="" disabled>Válassz járművet</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate}</option>)}</select></Field>
                <Field label="Munka leírása"><input name="description" maxLength={500} required /></Field>
                <Field label="Tervezett dátum"><input name="date" type="date" required /></Field>
                <Field label="Tervezett költség (HUF)"><input name="cost" type="number" min="0" step="1" required /></Field>
              </>}
            </fieldset>
          </div>
          <footer className="modal-actions"><button type="button" className="button" disabled={pending} onClick={close}>Mégse</button><button className="button primary" disabled={busy || (open === "vehicle" && !availableDrivers.length)}>{pending ? "Mentés folyamatban…" : open === "driver" ? "Sofőr mentése" : open === "vehicle" ? "Jármű mentése" : "Szerviz mentése"}</button></footer>
        </form>
      </Modal> : null}
    </>
  );
}
