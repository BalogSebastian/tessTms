"use client";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { seed } from "../../lib/tms/seed";
import {
  type TmsState,
  type CompanyId,
  type Order,
  type Status,
  uid,
} from "../../lib/tms/model";
import {
  assignmentError,
  transitionError,
  validateOrder,
} from "../../lib/tms/rules";

const STORAGE = "tessTMS.workspace.v1";
function makeStore() {
  let state = seed;
  let loaded = false;
  const listeners = new Set<() => void>();
  function load() {
    if (loaded) return;
    loaded = true;
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed.schema === 1 &&
          Object.keys(seed).every(
            (key) => key === "schema" || Array.isArray(parsed[key]),
          )
        )
          state = parsed;
      }
    } catch {
      /* Recover safely to the demonstration workspace. */
    }
  }
  return {
    subscribe(fn: () => void) {
      load();
      listeners.add(fn);
      const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE) {
          loaded = false;
          load();
          listeners.forEach((l) => l());
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(fn);
        window.removeEventListener("storage", onStorage);
      };
    },
    snapshot: () => state,
    serverSnapshot: () => seed,
    commit(action: string, entity: string, update: (draft: TmsState) => void) {
      load();
      const draft = structuredClone(state);
      update(draft);
      draft.audit.unshift({
        id: uid(),
        action,
        entity,
        at: new Date().toISOString(),
        actor: "Balog Sebastian · helyi demó",
      });
      draft.audit = draft.audit.slice(0, 1000);
      localStorage.setItem(STORAGE, JSON.stringify(draft));
      state = draft;
      listeners.forEach((l) => l());
    },
  };
}
type Store = ReturnType<typeof makeStore>;
interface TmsContextValue {
  state: TmsState;
  companyId: CompanyId | "all";
  setCompanyId: (value: CompanyId | "all") => void;
  orders: Order[];
  mutate: (
    action: string,
    entity: string,
    update: (draft: TmsState) => void,
  ) => boolean;
  notify: (text: string, error?: boolean) => void;
  saveOrder: (order: Order) => boolean;
  assign: (id: string, vehicleId: string) => boolean;
  transition: (id: string, next: Status) => boolean;
}
const Context = createContext<TmsContextValue | null>(null);
function ConnectedProvider({
  store,
  children,
}: {
  store: Store;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    store.serverSnapshot,
  );
  const [companyId, setCompanyId] = useState<CompanyId | "all">("all");
  const [toast, setToast] = useState<{
    text: string;
    error: boolean;
    id: string;
  } | null>(null);
  function notify(text: string, error = false) {
    const id = uid();
    setToast({ text, error, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 5500);
  }
  function mutate(
    action: string,
    entity: string,
    update: (draft: TmsState) => void,
  ) {
    try {
      store.commit(action, entity, update);
      notify(action);
      return true;
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "A módosítást nem sikerült menteni.",
        true,
      );
      return false;
    }
  }
  function saveOrder(order: Order) {
    return mutate("Fuvarmegbízás mentve", order.reference, (draft) => {
      const errors = validateOrder(draft, order);
      if (errors.length) throw new Error(errors[0]);
      const old = draft.orders.find((o) => o.id === order.id);
      if (old) Object.assign(old, order);
      else draft.orders.unshift(order);
    });
  }
  function assign(id: string, vehicleId: string) {
    return mutate("Erőforrás kiosztva", id, (draft) => {
      const order = draft.orders.find((o) => o.id === id);
      if (!order) throw new Error("A fuvar nem található.");
      if (!["Új", "Tervezett", "Kiosztva"].includes(order.status))
        throw new Error("A folyamatban lévő fuvar nem osztható át itt.");
      const err = assignmentError(draft, order, vehicleId);
      if (err) throw new Error(err);
      const v = draft.vehicles.find((v) => v.id === vehicleId)!;
      order.vehicleId = v.id;
      order.driverId = v.driverId;
      order.trailer = v.trailer;
      order.status = "Kiosztva";
    });
  }
  function transition(id: string, next: Status) {
    return mutate("Fuvarstátusz frissítve", id, (draft) => {
      const order = draft.orders.find((o) => o.id === id);
      if (!order) throw new Error("A fuvar nem található.");
      const err = transitionError(draft, order, next);
      if (err) throw new Error(err);
      order.status = next;
    });
  }
  return (
    <Context.Provider
      value={{
        state,
        companyId,
        setCompanyId,
        orders: state.orders.filter(
          (o) => companyId === "all" || o.companyId === companyId,
        ),
        mutate,
        notify,
        saveOrder,
        assign,
        transition,
      }}
    >
      {children}
      {toast ? (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          <span>{toast.error ? "!" : "✓"}</span>
          {toast.text}
          <button
            aria-label="Értesítés bezárása"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      ) : null}
    </Context.Provider>
  );
}
export function TmsProvider({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore);
  return <ConnectedProvider store={store}>{children}</ConnectedProvider>;
}
export function useTms() {
  const context = useContext(Context);
  if (!context) throw new Error("A TMS szolgáltató hiányzik.");
  return context;
}
