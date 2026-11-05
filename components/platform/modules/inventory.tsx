"use client";
import { useState } from "react";
import { useTms } from "../store";
import { money, uid } from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Panel, Table, Modal, Field, Badge, Stat } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Inventory() {
  const { state, companyId, mutate } = useTms();
  const [selected, setSelected] = useState("");
  const list = state.stock.filter(
    (s) => companyId === "all" || s.companyId === companyId,
  );
  return (
    <>
      <PageTitle
        title="Készlet & eszközök"
        description="Telephelyi készletek és dokumentált eszközmozgások."
      />
      <div className="stats-grid three">
        <Stat
          label="Készletérték"
          value={money(list.reduce((s, x) => s + x.quantity * x.price, 0))}
          note="Nyilvántartási egységáron"
          icon="box"
          accent
        />
        <Stat
          label="Minimum alatti tételek"
          value={list.filter((x) => x.quantity < x.minimum).length}
          note="Beszerzési figyelmeztetések"
          icon="alert"
        />
        <Stat
          label="Nyilvántartott cikkszám"
          value={list.length}
          note="Telephelyenként és műhelyenként"
          icon="building"
        />
      </div>
      <Panel title="Cikktörzs és állomány">
        <Table
          headers={[
            "Cikk",
            "Telephely",
            "Készlet",
            "Érték",
            "Állapot",
            "Mozgás",
          ]}
        >
          {list.map((s) => (
            <tr key={s.id}>
              <td className="cell-title">{s.name}</td>
              <td>{s.depot}</td>
              <td>
                {s.quantity} {s.unit}
                <small>Minimum: {s.minimum}</small>
              </td>
              <td>{money(s.quantity * s.price)}</td>
              <td>
                <Badge tone={s.quantity < s.minimum ? "amber" : "green"}>
                  {s.quantity < s.minimum ? "Utánrendelés" : "Megfelelő"}
                </Badge>
              </td>
              <td>
                <button
                  className="button small"
                  onClick={() => setSelected(s.id)}
                >
                  <Icon name="plus" size={13} />
                  Mozgás
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      <div className="spaced" />
      <Panel title="Mozgásnapló és átvételi nyilvántartás">
        <Table headers={["Cikk", "Mennyiség", "Átadó / átvevő", "Időpont"]}>
          {state.stockMoves
            .filter((m) => list.some((s) => s.id === m.stockId))
            .map((m) => (
              <tr key={m.id}>
                <td>{state.stock.find((s) => s.id === m.stockId)?.name}</td>
                <td className={m.quantity < 0 ? "negative" : "positive"}>
                  {m.quantity > 0 ? "+" : ""}
                  {m.quantity}
                </td>
                <td>{m.recipient}</td>
                <td>{new Date(m.createdAt).toLocaleString("hu-HU")}</td>
              </tr>
            ))}
        </Table>
      </Panel>
      {selected ? (
        <Modal title="Készletmozgás rögzítése" onClose={() => setSelected("")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const quantity =
                Number(f.get("quantity")) *
                (f.get("kind") === "Kiadás" ? -1 : 1);
              if (
                mutate("Készletmozgás rögzítve", selected, (d) => {
                  const s = d.stock.find((s) => s.id === selected)!;
                  if (s.quantity + quantity < 0)
                    throw new Error("Nincs elegendő készlet a kiadáshoz.");
                  s.quantity += quantity;
                  d.stockMoves.unshift({
                    id: uid(),
                    stockId: selected,
                    quantity,
                    recipient: String(f.get("recipient")),
                    createdAt: new Date().toISOString(),
                  });
                })
              )
                setSelected("");
            }}
          >
            <div className="modal-body stack">
              <Field label="Mozgástípus">
                <select name="kind">
                  <option>Kiadás</option>
                  <option>Bevételezés</option>
                  <option>Visszavétel</option>
                </select>
              </Field>
              <Field label="Mennyiség">
                <input name="quantity" type="number" min="1" required />
              </Field>
              <Field label="Átadó / átvevő / munkalap">
                <input
                  name="recipient"
                  required
                  placeholder="Pl. Kovács Zoltán · RTS-218"
                />
              </Field>
            </div>
            <footer className="modal-actions">
              <button className="button primary">Mozgás mentése</button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
