"use client";
import { useEffect, useRef, useId, type ReactNode } from "react";
import { Icon } from "./icon";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "red" | "blue" | "neutral";
}) {
  return (
    <span className={`badge ${tone}`}>
      <i />
      {children}
    </span>
  );
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      tone={
        [
          "Úton",
          "Lezárva",
          "Kész",
          "Jóváhagyva",
          "Tesztelve",
          "Beérkezett",
        ].includes(status)
          ? "green"
          : ["Dokumentáció", "Igény", "Nyitott", "Tervezett"].includes(status)
            ? "amber"
            : status === "Hibás"
              ? "red"
              : "blue"
      }
    >
      {status}
    </Badge>
  );
}
export function Panel({
  title,
  eyebrow,
  actions,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}
export function Stat({
  label,
  value,
  note,
  icon,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  note: string;
  icon: string;
  accent?: boolean;
}) {
  return (
    <article className={`stat ${accent ? "accent" : ""}`}>
      <div className="stat-top">
        <span>{label}</span>
        <Icon name={icon} size={17} />
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}
export function Empty({
  title = "Még nincs megjeleníthető adat.",
  text = "Az új rekordok automatikusan itt jelennek meg.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <Icon name="folder" size={30} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-btn"
          onClick={onClose}
          aria-label="Ablak bezárása"
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <div className={`notice ${tone}`}>
      <Icon name={tone === "warning" ? "alert" : "shield"} size={17} />
      <div>{children}</div>
    </div>
  );
}
export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Progress({ value }: { value: number }) {
  return (
    <div className="progress-track">
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
