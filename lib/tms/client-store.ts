import type { TmsState } from "./model";

export interface Workspace {
  state: TmsState;
  revision: number;
}

export type WorkspaceRequest = (
  url: string,
  init?: RequestInit,
) => Promise<Workspace>;

export function createClientStore(
  initial: Workspace,
  request: WorkspaceRequest,
) {
  let generation = 0;
  let view = {
    ...initial,
    saving: false,
    lastSynced: new Date().toISOString(),
  };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => view,
    async refresh() {
      if (view.saving) return;
      const requestedGeneration = generation;
      const fresh = await request("/api/workspace");
      if (
        !view.saving &&
        generation === requestedGeneration &&
        fresh.revision >= view.revision
      ) {
        view = {
          ...fresh,
          saving: false,
          lastSynced: new Date().toISOString(),
        };
        emit();
      }
    },
    commit(
      action: string,
      entity: string,
      update: (draft: TmsState) => void,
    ): Promise<void> {
      if (view.saving)
        throw new Error(
          "Az előző módosítás mentése folyamatban van. Kérlek, várj egy pillanatot.",
        );
      const previous = view;
      const draft = structuredClone(view.state);
      update(draft);
      generation += 1;
      view = { ...view, state: draft, saving: true };
      emit();
      return request("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: draft,
          revision: previous.revision,
          action,
          entity,
        }),
      })
        .then((saved) => {
          view = {
            ...saved,
            saving: false,
            lastSynced: new Date().toISOString(),
          };
          emit();
        })
        .catch(async (error: unknown) => {
          let restored = previous;
          try {
            const fresh = await request("/api/workspace");
            if (fresh.revision >= previous.revision)
              restored = {
                ...fresh,
                saving: false,
                lastSynced: new Date().toISOString(),
              };
          } catch {
            /* Preserve last confirmed state. */
          }
          view = { ...restored, saving: false };
          emit();
          throw error;
        });
    },
  };
}
