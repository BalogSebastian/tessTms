"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api, roleLabels, useTms, type SessionUser } from "../store";
import { downloadBlob, exportCsv } from "../../../lib/tms/files";
import { modules } from "../../../lib/tms/catalog";
import { PageTitle } from "../ui/page-title";
import { Panel, Table, Badge, Notice, Field, Modal } from "../ui/primitives";
import { Icon } from "../ui/icon";
import { CompanyManager } from "../company-manager";

type Account = Pick<SessionUser, "id" | "name" | "email" | "role"> & {
  active: number;
};
export default function Settings() {
  const { state, user, revision, notify, refresh } = useTms();
  const [users, setUsers] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  useEffect(() => {
    if (user.role === "admin")
      void api<{ users: Account[] }>("/api/users")
        .then((data) => setUsers(data.users))
        .catch((error: unknown) => notify(String(error), true));
  }, [user.role]); // eslint-disable-line react-hooks/exhaustive-deps
  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await api<{ user: Account }>("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      setUsers((list) => [...list, result.user]);
      setOpen(false);
      notify("A felhasználói fiók létrejött.");
      await refresh();
    } catch (error) {
      notify(String(error), true);
    } finally {
      setBusy(false);
    }
  }
  async function editUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await api<{ user: Account }>(
        `/api/users/${encodeURIComponent(editing.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: form.get("role"),
            active: form.get("active") === "on",
          }),
        },
      );
      setUsers((list) =>
        list.map((account) =>
          account.id === result.user.id ? result.user : account,
        ),
      );
      setEditing(null);
      notify("A hozzáférés módosítva.");
      if (
        result.user.id === user.id &&
        (result.user.role !== user.role || !result.user.active)
      )
        window.location.reload();
      else await refresh();
    } catch (error) {
      notify(String(error), true);
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("newPassword") !== form.get("confirmPassword")) {
      notify("Az új jelszó és a megerősítés nem egyezik.", true);
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword"),
        }),
      });
      setPasswordOpen(false);
      notify("Jelszó megváltoztatva. A többi munkamenet kijelentkeztetve.");
      await refresh();
    } catch (error) {
      notify(String(error), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="A munkatér irányítása"
        description="Hozzáférések, rendszerállapot és minden változás egy helyen."
        eyebrow="RENDSZER ÉS BIZTONSÁG"
      >
        <button className="button" onClick={() => setPasswordOpen(true)}>
          <Icon name="shield" size={16} /> Jelszó módosítása
        </button>
        <button
          className="button"
          onClick={() =>
            downloadBlob(
              new Blob(
                [
                  JSON.stringify(
                    {
                      exportedAt: new Date().toISOString(),
                      workspace: user.workspaceName,
                      revision,
                      state,
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
              "tessTMS-adatexport.json",
            )
          }
        >
          <Icon name="download" size={16} /> Adatok exportálása
        </button>
      </PageTitle>
      <div className="two-panel-grid">
        <Panel title="Munkatér és hozzáférés" eyebrow="AZONOSÍTÁS">
          <div className="key-value-list">
            <div>
              <span>Munkatér</span>
              <strong>{user.workspaceName}</strong>
            </div>
            <div>
              <span>Felhasználó</span>
              <strong>{user.name}</strong>
            </div>
            <div>
              <span>E-mail-cím</span>
              <strong>{user.email}</strong>
            </div>
            <div>
              <span>Szerepkör</span>
              <Badge tone="green">{roleLabels[user.role]}</Badge>
            </div>
            <div>
              <span>Munkatér-azonosító</span>
              <strong style={{ fontSize: 10, overflowWrap: "anywhere" }}>
                {user.workspaceId}
              </strong>
            </div>
          </div>
        </Panel>
        <Panel title="Rendszerállapot" eyebrow="MŰKÖDÉS">
          <div className="key-value-list">
            <div>
              <span>Adatbázis</span>
              <Badge tone="green">SQLite · szerveroldali</Badge>
            </div>
            <div>
              <span>Adatverzió</span>
              <strong>v{revision} · Ütközésvédelemmel</strong>
            </div>
            <div>
              <span>Bejelentkezés</span>
              <Badge tone="green">Védett munkamenet</Badge>
            </div>
            <div>
              <span>Dokumentumok</span>
              <strong>Privát, munkatérhez kötött fájltár</strong>
            </div>
            <div>
              <span>Változásnapló</span>
              <strong>Szerveroldali, csak hozzáfűzhető</strong>
            </div>
          </div>
        </Panel>
      </div>
      <Notice>
        Az adatexport a nyilvántartás rekordjait tartalmazza. A teljes
        visszaállítható mentéshez az üzemeltető az adatbázist menti; ez a fájlok
        tartalmát és a hozzáférési adatokat is megőrzi.
      </Notice>
      <CompanyManager />
      <div className="spaced" />
      {user.role === "admin" ? (
        <Panel
          title="Csapat és jogosultságok"
          eyebrow="FELHASZNÁLÓKEZELÉS"
          actions={
            <button className="button small" onClick={() => setOpen(true)}>
              <Icon name="plus" size={15} /> Csapattag hozzáadása
            </button>
          }
        >
          <Table
            headers={["Név", "E-mail", "Szerepkör", "Állapot", "Hozzáférés"]}
          >
            {users.map((account) => (
              <tr key={account.id}>
                <td className="cell-title">
                  {account.name}
                  {account.id === user.id ? <small>Saját fiók</small> : null}
                </td>
                <td>{account.email}</td>
                <td>{roleLabels[account.role]}</td>
                <td>
                  <Badge tone={account.active ? "green" : "neutral"}>
                    {account.active ? "Aktív" : "Letiltva"}
                  </Badge>
                </td>
                <td>
                  <button
                    className="button small"
                    onClick={() => setEditing(account)}
                  >
                    Kezelés
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          <p className="system-audit-note">
            Adminisztrátor: teljes kezelés · Diszpécser: operáció · Pénzügy:
            költségek és számlaelőkészítés · Megtekintő: olvasás. A hozzáférést
            minden API-kérésnél a szerver ellenőrzi.
          </p>
        </Panel>
      ) : null}
      <div className="spaced" />
      <Panel
        title="Eseménynapló"
        eyebrow="VISSZAKÖVETHETŐ MŰKÖDÉS"
        actions={
          <button
            className="text-link"
            onClick={() =>
              exportCsv("esemenynaplo.csv", [
                ["Idő", "Művelet", "Entitás", "Felhasználó"],
                ...state.audit.map((event) => [
                  event.at,
                  event.action,
                  event.entity,
                  event.actor,
                ]),
              ])
            }
          >
            Export <Icon name="download" size={14} />
          </button>
        }
      >
        <Table
          headers={["Időpont", "Művelet", "Kapcsolódó adat", "Felhasználó"]}
        >
          {state.audit.slice(0, 100).map((event) => (
            <tr key={event.id}>
              <td>
                {new Date(event.at).toLocaleString("hu-HU", {
                  timeZone: "Europe/Budapest",
                })}
              </td>
              <td className="cell-title">{event.action}</td>
              <td className="truncate-cell">{event.entity}</td>
              <td>{event.actor}</td>
            </tr>
          ))}
        </Table>
      </Panel>
      <div className="spaced" />
      <Panel title="A teljes TMS munkatér" eyebrow="MODULOK ÉS KAPCSOLATOK">
        <Table headers={["PDF-fejezet", "Modul", "Működés"]}>
          {modules
            .filter((module) => !["overview", "settings"].includes(module.key))
            .map((module) => (
              <tr key={module.key}>
                <td>{module.ref}</td>
                <td>
                  <a className="text-link" href={`/${module.key}`}>
                    {module.title} <Icon name="arrow" size={13} />
                  </a>
                </td>
                <td>
                  <Badge tone={Number(module.ref) >= 14 ? "amber" : "green"}>
                    {Number(module.ref) >= 14
                      ? "Külső kapcsolatot igényelhet"
                      : "Központi munkafolyamat"}
                  </Badge>
                </td>
              </tr>
            ))}
        </Table>
      </Panel>
      {editing ? (
        <Modal
          title={`${editing.name} · Hozzáférés`}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={editUser}>
            <div className="modal-body stack">
              <Field label="Szerepkör">
                <select name="role" defaultValue={editing.role}>
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={Boolean(editing.active)}
                />{" "}
                Aktív felhasználó
              </label>
              <Notice>
                A szerepkör módosítása vagy a letiltás visszavonja a felhasználó
                korábbi munkameneteit. Az utolsó aktív adminisztrátor
                hozzáférése megmarad.
              </Notice>
            </div>
            <footer className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setEditing(null)}
              >
                Mégse
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Mentés…" : "Hozzáférés mentése"}
              </button>
            </footer>
          </form>
        </Modal>
      ) : null}
      {passwordOpen ? (
        <Modal title="Jelszó módosítása" onClose={() => setPasswordOpen(false)}>
          <form onSubmit={changePassword}>
            <div className="modal-body stack">
              <Field label="Jelenlegi jelszó">
                <input
                  name="currentPassword"
                  type="password"
                  required
                  maxLength={128}
                  autoComplete="current-password"
                />
              </Field>
              <Field label="Új jelszó" hint="Legalább 12 karakter.">
                <input
                  name="newPassword"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Új jelszó megerősítése">
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </Field>
              <Notice>
                A mentés után a többi eszközön újra be kell jelentkezned.
              </Notice>
            </div>
            <footer className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setPasswordOpen(false)}
              >
                Mégse
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Mentés…" : "Jelszó mentése"}
              </button>
            </footer>
          </form>
        </Modal>
      ) : null}
      {open ? (
        <Modal title="Új csapattag" onClose={() => setOpen(false)}>
          <form onSubmit={addUser}>
            <div className="modal-body stack">
              <Field label="Teljes név">
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="off"
                />
              </Field>
              <Field label="E-mail-cím">
                <input name="email" type="email" required autoComplete="off" />
              </Field>
              <Field
                label="Kezdeti jelszó"
                hint="Legalább 12 karakter. Biztonságos csatornán add át a csapattagnak."
              >
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Szerepkör">
                <select name="role" defaultValue="dispatcher">
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <footer className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setOpen(false)}
              >
                Mégse
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Létrehozás…" : "Fiók létrehozása"}
              </button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
