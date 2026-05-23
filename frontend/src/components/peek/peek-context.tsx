import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

// A "peek" is a side-panel look at an entity opened from somewhere that isn't
// that entity's own list — so you can inspect a linked contact/company/deal
// without losing your place. The panel always carries an "open full page"
// link to escalate to the real detail route.
export type PeekKind = "contact" | "company" | "deal" | "ticket";

export type PeekTarget = { kind: PeekKind; id: string };

type PeekContextValue = {
  target: PeekTarget | null;
  peek: (kind: PeekKind, id: string) => void;
  closePeek: () => void;
};

const PeekContext = createContext<PeekContextValue | null>(null);

export function PeekProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<PeekTarget | null>(null);
  const peek = useCallback(
    (kind: PeekKind, id: string) => setTarget({ kind, id }),
    [],
  );
  const closePeek = useCallback(() => setTarget(null), []);
  return (
    <PeekContext.Provider value={{ target, peek, closePeek }}>
      {children}
    </PeekContext.Provider>
  );
}

export function usePeek(): PeekContextValue {
  const ctx = useContext(PeekContext);
  if (!ctx) throw new Error("usePeek must be used within <PeekProvider>");
  return ctx;
}
