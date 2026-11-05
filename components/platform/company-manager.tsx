"use client";
import { useState, type FormEvent } from "react";
import { useTms } from "./store";
import { uid, type Company } from "../../lib/tms/model";
import { Field, Modal, Notice, Panel, Table } from "./ui/primitives";
import { Icon } from "./ui/icon";

export function CompanyManager() {
  const { state, companies, user, mutateAsync, isSaving } = useTms();
  const [editing, setEditing] = useState<Company | null | undefined>(undefined);
  const admin = user.role === "admin";
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const short = String(form.get("short") || "").trim();
    const ok = await mutateAsync(
      editing ? "Cégadatok módosítva" : "Cég létrehozva",
      name,
      (draft) => {
        const master = draft.companies ?? structuredClone(companies);
        if (
          master.some(
            (company) =>
              company.id !== editing?.id &&
              company.name.toLocaleLowerCase("hu-HU") ===
                name.toLocaleLowerCase("hu-HU"),
          )
        )
          throw new Error("Ez a cégnév már szerepel a munkatérben.");
        if (editing) {
          const target = master.find((company) => company.id === editing.id);
          if (!target)
            throw new Error(
              "A cég időközben megváltozott. Frissítsd a munkateret.",
            );
          Object.assign(target, { name, short });
        } else master.push({ id: uid(), name, short });
        draft.companies = master;
      },
    );
    if (ok) setEditing(undefined);
  }
  return (
    <>
      <Panel
        title="Cégek a munkatérben"
        actions={
          admin ? (
            <button
              className="button small"
              disabled={isSaving}
              onClick={() => setEditing(null)}
            >
              <Icon name="plus" size={15} /> Új cég
            </button>
          ) : undefined
        }
      >
        <Table headers={["Cég", "Rövid név", "Fuvarok", "Járművek", "Művelet"]}>
          {companies.map((company) => (
            <tr key={company.id}>
              <td className="cell-title">{company.name}</td>
              <td>{company.short}</td>
              <td>
                {
                  state.orders.filter((order) => order.companyId === company.id)
                    .length
                }
              </td>
              <td>
                {
                  state.vehicles.filter(
                    (vehicle) => vehicle.companyId === company.id,
                  ).length
                }
              </td>
              <td>
                {admin ? (
                  <button
                    className="button small"
                    disabled={isSaving}
                    onClick={() => setEditing(company)}
                  >
                    <Icon name="settings" size={13} /> Szerkesztés
                  </button>
                ) : (
                  "Megtekintés"
                )}
              </td>
            </tr>
          ))}
        </Table>
        <div className="form-body">
          <Notice>
            A cégtörzs a fuvarok, járművek, sofőrök és pénzügyi adatok közös
            alapja. Átnevezéskor a korábbi rekordok kapcsolata megmarad. Céget
            adminisztrátor rögzíthet és módosíthat.
          </Notice>
        </div>
      </Panel>
      {admin && editing !== undefined ? (
        <Modal
          title={editing ? "Cégadatok módosítása" : "Új cég rögzítése"}
          onClose={() => setEditing(undefined)}
        >
          <form onSubmit={save}>
            <div className="modal-body form-grid">
              <Field label="Cég teljes neve">
                <input
                  name="name"
                  defaultValue={editing?.name || ""}
                  required
                  minLength={2}
                  maxLength={160}
                  autoFocus
                />
              </Field>
              <Field label="Rövid név / monogram">
                <input
                  name="short"
                  defaultValue={editing?.short || ""}
                  required
                  maxLength={12}
                  placeholder="Pl. LOG"
                />
              </Field>
            </div>
            <footer className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setEditing(undefined)}
              >
                Mégse
              </button>
              <button className="button primary" disabled={isSaving}>
                {isSaving ? "Mentés…" : "Cég mentése"}
              </button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
