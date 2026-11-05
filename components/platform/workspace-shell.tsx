"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { modules } from "../../lib/tms/catalog";
import { type CompanyId } from "../../lib/tms/model";
import { roleLabels, useTms } from "./store";
import { Icon } from "./ui/icon";
import { Modal, Empty } from "./ui/primitives";

export default function WorkspaceShell({
  active,
  children,
}: {
  active: string;
  children: ReactNode;
}) {
  const { state, companyId, setCompanyId, user, logout, isSaving, companies } =
    useTms();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [mobile, setMobile] = useState(false);
  const current = modules.find((m) => m.key === active);
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === "Escape") setMobile(false);
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const openIncidents = state.incidents.filter((i) => i.status === "Nyitott");
  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main-content">
        Ugrás a tartalomhoz
      </a>
      {mobile ? (
        <button
          className="nav-backdrop"
          aria-label="Navigáció bezárása"
          onClick={() => setMobile(false)}
        />
      ) : null}
      <aside
        id="workspace-navigation"
        className={`side-nav ${mobile ? "mobile-open" : ""}`}
      >
        <Link className="wordmark" href="/">
          <span className="logo-symbol">
            t<span>↗</span>
          </span>
          <strong>
            tess<span>TMS</span>
          </strong>
          <span className="version-tag">PRO</span>
        </Link>
        <div className="workspace-select">
          <span className="workspace-avatar">
            {user.workspaceName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <strong>{user.workspaceName}</strong>
            <small>Vállalati munkatér</small>
          </div>
          <Icon name="down" size={14} />
        </div>
        <nav aria-label="Modulok">
          {[
            "Áttekintés",
            "Operáció",
            "Erőforrások",
            "Pénzügy",
            "Intelligencia",
            "Platform",
          ].map((group) => (
            <div className="nav-group" key={group}>
              <p>{group}</p>
              {modules
                .filter((m) => m.group === group)
                .map((m) => (
                  <Link
                    onClick={() => setMobile(false)}
                    href={m.key === "overview" ? "/" : `/${m.key}`}
                    aria-current={m.key === active ? "page" : undefined}
                    className={`nav-link ${active === m.key ? "active" : ""}`}
                    key={m.key}
                  >
                    <Icon name={m.icon} size={17} />
                    <span>{m.title}</span>
                    {m.key === "orders" ? <b>{state.orders.length}</b> : null}
                    {m.key === "scan" ? <small>AI</small> : null}
                  </Link>
                ))}
            </div>
          ))}
        </nav>
        <div className="user-profile">
          <span className="user-avatar">{initials}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{roleLabels[user.role]}</small>
          </div>
          <button
            className="logout-button"
            onClick={() => void logout()}
            aria-label="Kijelentkezés"
            title="Kijelentkezés"
          >
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="top-bar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Menü megnyitása"
            aria-controls="workspace-navigation"
            aria-expanded={mobile}
            onClick={() => setMobile(!mobile)}
          >
            <Icon name="menu" />
          </button>
          <button
            className="top-search-button"
            onClick={() => setSearchOpen(true)}
            aria-label="Keresés a munkatérben"
          >
            <Icon name="search" size={15} />
            <span>Fuvarszám, partner vagy modul keresése…</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="breadcrumbs">
            Munkatér <Icon name="right" size={13} />
            <strong>{current?.title || "Új fuvarmegbízás"}</strong>
          </div>
          <div className="top-actions">
            <span className="workspace-edition">
              <i /> TESOTTER PLATFORM
            </span>
            <button
              className="icon-btn notification-trigger"
              aria-label="Értesítések"
              onClick={() => setNotifications(true)}
            >
              <Icon name="bell" />
              {openIncidents.length ? <i /> : null}
            </button>
            <Link
              href="/settings"
              className="top-user"
              aria-label="Fiók és beállítások"
            >
              <span className="top-avatar">{initials}</span>
              <div>
                <strong>{user.name}</strong>
                <small>{roleLabels[user.role]}</small>
              </div>
            </Link>
          </div>
        </header>
        <main id="main-content" className="page-content">
          <div className="context-line">
            <span
              className={`save-status ${isSaving ? "pending" : ""}`}
              role="status"
            >
              <i />
              {isSaving ? "Módosítások mentése…" : "Minden módosítás mentve"}
            </span>
            <label className="company-filter">
              <Icon name="building" size={14} />
              <select
                aria-label="Cégszűrő"
                value={companyId}
                onChange={(e) =>
                  setCompanyId(e.target.value as CompanyId | "all")
                }
              >
                <option value="all">Teljes cégcsoport</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {user.role === "viewer" ? (
            <div className="workspace-access-banner">
              Megtekintői hozzáférés · A munkatér adatait olvashatod és
              exportálhatod.
            </div>
          ) : null}
          {children}
          <footer className="workspace-footer">
            <span>tessTMS · Tesotter platform</span>
            <span>
              {user.workspaceName} · Központi mentés · Védett hozzáférés
            </span>
          </footer>
        </main>
      </div>
      {searchOpen ? (
        <Modal
          title="Keresés a munkatérben"
          onClose={() => setSearchOpen(false)}
        >
          <div className="modal-body">
            <input
              autoFocus
              aria-label="Keresett kifejezés"
              placeholder="Fuvarszám, partner vagy modul…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="search-results">
              {modules
                .filter((m) =>
                  `${m.title} ${m.subtitle}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((m) => (
                  <Link
                    onClick={() => setSearchOpen(false)}
                    href={m.key === "overview" ? "/" : `/${m.key}`}
                    key={m.key}
                  >
                    <Icon name={m.icon} />
                    <span>
                      {m.title}
                      <small>Modul</small>
                    </span>
                    <Icon name="arrow" size={15} />
                  </Link>
                ))}
              {state.orders
                .filter((o) =>
                  `${o.reference} ${state.partners.find((p) => p.id === o.partnerId)?.name}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .slice(0, 8)
                .map((o) => (
                  <Link
                    onClick={() => setSearchOpen(false)}
                    href={`/orders?order=${o.id}`}
                    key={o.id}
                  >
                    <Icon name="orders" />
                    <span>
                      {o.reference}
                      <small>
                        {state.partners.find((p) => p.id === o.partnerId)?.name}
                      </small>
                    </span>
                    <Icon name="arrow" size={15} />
                  </Link>
                ))}
            </div>
          </div>
        </Modal>
      ) : null}
      {notifications ? (
        <Modal
          title="Műveleti értesítések"
          onClose={() => setNotifications(false)}
        >
          <div className="modal-body">
            {openIncidents.length ? (
              openIncidents.map((i) => (
                <Link
                  onClick={() => setNotifications(false)}
                  className="notification-card"
                  key={i.id}
                  href="/damage"
                >
                  <Icon name="alert" />
                  <div>
                    <strong>
                      {state.orders.find((o) => o.id === i.orderId)
                        ?.reference || "Flottajelzés"}
                    </strong>
                    <p>{i.description}</p>
                  </div>
                </Link>
              ))
            ) : (
              <Empty title="Minden értesítés feldolgozva." />
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
