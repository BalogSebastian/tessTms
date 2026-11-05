"use client";
import { useState, type FormEvent } from "react";
import { useTms } from "../store";
import { money, number, uid, type CompanyId } from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Panel, Table, Modal, Field, Badge, Stat, Empty } from "../ui/primitives";
import { Icon } from "../ui/icon";

export default function Inventory() {
  const { state, companies, companyId, user, isSaving, mutateAsync } = useTms();
  const [selected, setSelected] = useState("");
  const [newItem, setNewItem] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");
  const canEdit = user.role === "admin" || user.role === "dispatcher";
  const busy = pending || isSaving;
  const list = state.stock.filter((stock) => companyId === "all" || stock.companyId === companyId);
  const selectedStock = state.stock.find((stock) => stock.id === selected);
  function close(event?: { preventDefault(): void }) { if (pending) event?.preventDefault(); else { setSelected(""); setNewItem(false); } }
  function showMovement(id: string) { setFormError(""); setSelected(id); }
  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canEdit) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const depot = String(form.get("depot")).trim();
    const company = form.get("company") as CompanyId;
    const quantity = Number(form.get("quantity"));
    setPending(true); setFormError("");
    const ok = await mutateAsync("Készletcikk létrehozva", name, (draft) => {
      if (draft.stock.some((stock) => stock.companyId === company && stock.name.trim().toLocaleLowerCase("hu-HU") === name.toLocaleLowerCase("hu-HU") && stock.depot.trim().toLocaleLowerCase("hu-HU") === depot.toLocaleLowerCase("hu-HU"))) throw new Error("Ez a cikk ezen a telephelyen már szerepel. Rögzíts készletmozgást a meglévő cikkhez.");
      const id = uid();
      draft.stock.push({id,name,depot,companyId:company,quantity,minimum:Number(form.get("minimum")),unit:String(form.get("unit")).trim(),price:Number(form.get("price"))});
      if (quantity > 0) draft.stockMoves.unshift({id:uid(),stockId:id,quantity,recipient:`Nyitókészlet · ${user.name}`,createdAt:new Date().toISOString()});
    });
    setPending(false);
    if (ok) setNewItem(false);
    else setFormError("A mentés nem sikerült. Ellenőrizd az értesítésben jelzett hibát; a kitöltött adataid megmaradtak.");
  }
  async function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canEdit || !selected) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("quantity"));
    const quantity = amount * (form.get("kind") === "Kiadás" ? -1 : 1);
    setPending(true); setFormError("");
    const ok = await mutateAsync("Készletmozgás rögzítve", selected, (draft) => {
      const stock = draft.stock.find((item) => item.id === selected);
      if (!stock) throw new Error("A készletcikk nem található.");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("A mozgás mennyisége legyen pozitív.");
      if (stock.quantity + quantity < 0) throw new Error("Nincs elegendő készlet a kiadáshoz.");
      stock.quantity += quantity;
      draft.stockMoves.unshift({id:uid(),stockId:selected,quantity,recipient:String(form.get("recipient")).trim(),createdAt:new Date().toISOString()});
    });
    setPending(false);
    if (ok) setSelected("");
    else setFormError("A mozgás nem menthető. Ellenőrizd a készletet és az értesítésben jelzett hibát; az adataid megmaradtak.");
  }
  return <>
    <PageTitle title="Készlet & eszközök" description="Telephelyi készletek, nyitóállomány és visszakövethető eszközmozgások.">
      {canEdit ? <button className="button primary" disabled={busy || !companies.length} onClick={() => {setFormError("");setNewItem(true);}}><Icon name="plus" size={16} />Új készletcikk</button> : null}
    </PageTitle>
    <div className="stats-grid three">
      <Stat label="Készletérték" value={money(list.reduce((sum,stock) => sum+stock.quantity*stock.price,0))} note="Nyilvántartási egységáron" icon="box" accent />
      <Stat label="Minimum alatti tételek" value={list.filter((stock) => stock.quantity<stock.minimum).length} note="Beszerzési figyelmeztetések" icon="alert" />
      <Stat label="Nyilvántartott cikkek" value={list.length} note="Telephelyenként és műhelyenként" icon="building" />
    </div>
    <Panel title="Cikktörzs és állomány">
      <Table headers={["Cikk / cég","Telephely","Készlet","Érték","Állapot","Mozgás"]}>
        {list.map((stock) => <tr key={stock.id}>
          <td className="cell-title">{stock.name}<small>{companies.find((company) => company.id===stock.companyId)?.name}</small></td>
          <td>{stock.depot}</td><td>{number(stock.quantity)} {stock.unit}<small>Minimum: {number(stock.minimum)} {stock.unit}</small></td>
          <td>{money(stock.quantity*stock.price)}<small>{money(stock.price)} / {stock.unit}</small></td>
          <td><Badge tone={stock.quantity<stock.minimum ? "amber" : "green"}>{stock.quantity<stock.minimum ? "Utánrendelés" : "Megfelelő"}</Badge></td>
          <td>{canEdit ? <button className="button small" disabled={busy} onClick={() => showMovement(stock.id)}><Icon name="plus" size={13} />Mozgás</button> : null}</td>
        </tr>)}
      </Table>
      {!list.length ? <Empty title="Még nincs nyilvántartott készlet." text="Az Új készletcikk gombbal rögzítheted az első cikket és a nyitóállományát." /> : null}
    </Panel>
    <div className="spaced" />
    <Panel title="Mozgásnapló és átvételi nyilvántartás">
      <Table headers={["Cikk","Mennyiség","Átadó / átvevő","Időpont"]}>
        {state.stockMoves.filter((move) => list.some((stock) => stock.id===move.stockId)).map((move) => <tr key={move.id}>
          <td>{state.stock.find((stock) => stock.id===move.stockId)?.name}</td>
          <td className={move.quantity<0 ? "negative" : "positive"}>{move.quantity>0 ? "+" : ""}{number(move.quantity)} {state.stock.find((stock) => stock.id===move.stockId)?.unit}</td>
          <td>{move.recipient}</td><td>{new Date(move.createdAt).toLocaleString("hu-HU",{timeZone:"Europe/Budapest"})}</td>
        </tr>)}
      </Table>
      {!state.stockMoves.some((move) => list.some((stock) => stock.id===move.stockId)) ? <Empty title="A mozgásnapló még üres." text="A nyitókészlet, a bevételezés és a kiadás itt lesz visszakövethető." /> : null}
    </Panel>
    {newItem ? <Modal title="Új készletcikk" onClose={close} wide>
      <form onSubmit={(event) => void saveItem(event)} aria-busy={pending}>
        <div className="modal-body">
          {formError ? <p className="negative" role="alert">{formError}</p> : null}
          <fieldset disabled={pending} className="form-grid" style={{border:0,padding:0,margin:0}}>
            <Field label="Cikk megnevezése"><input name="name" maxLength={150} required /></Field>
            <Field label="Telephely / raktár"><input name="depot" maxLength={150} required /></Field>
            <Field label="Cég"><select name="company" defaultValue={companyId==="all" ? companies[0]?.id || "" : companyId} required>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
            <Field label="Mértékegység"><input name="unit" placeholder="db, liter, kg…" maxLength={30} required /></Field>
            <Field label="Nyitókészlet" hint="Pozitív nyitóállomány esetén nyitó készletmozgás is készül ugyanabban a mentésben."><input name="quantity" type="number" min="0" step="any" defaultValue="0" required /></Field>
            <Field label="Minimumkészlet"><input name="minimum" type="number" min="0" step="any" defaultValue="0" required /></Field>
            <Field label="Nettó nyilvántartási egységár (HUF)"><input name="price" type="number" min="0" step="0.01" required /></Field>
          </fieldset>
        </div>
        <footer className="modal-actions"><button type="button" className="button" disabled={pending} onClick={close}>Mégse</button><button className="button primary" disabled={busy}>{pending ? "Mentés folyamatban…" : "Cikk és nyitókészlet mentése"}</button></footer>
      </form>
    </Modal> : null}
    {selectedStock ? <Modal title={`Készletmozgás · ${selectedStock.name}`} onClose={close}>
      <form onSubmit={(event) => void saveMovement(event)} aria-busy={pending}>
        <div className="modal-body">
          <p className="muted">{selectedStock.depot} · Elérhető: {number(selectedStock.quantity)} {selectedStock.unit}</p>
          {formError ? <p className="negative" role="alert">{formError}</p> : null}
          <fieldset disabled={pending} className="stack" style={{border:0,padding:0,margin:"16px 0 0"}}>
            <Field label="Mozgástípus"><select name="kind"><option>Kiadás</option><option>Bevételezés</option><option>Visszavétel</option></select></Field>
            <Field label={`Mennyiség (${selectedStock.unit})`}><input name="quantity" type="number" min="0.001" step="any" required /></Field>
            <Field label="Átadó / átvevő / munkalap"><input name="recipient" maxLength={200} placeholder="Név és bizonylat vagy munkalapszám" required /></Field>
          </fieldset>
        </div>
        <footer className="modal-actions"><button type="button" className="button" disabled={pending} onClick={close}>Mégse</button><button className="button primary" disabled={busy}>{pending ? "Mentés folyamatban…" : "Mozgás mentése"}</button></footer>
      </form>
    </Modal> : null}
  </>;
}
