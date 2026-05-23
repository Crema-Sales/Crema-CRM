import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterShortcut, type Shortcut } from "@/hooks/use-shortcuts";

type ListNavOptions<T extends { id: string }> = {
  items: T[];
  scope: string;
  onOpen?: (item: T) => void;
};

export function useListNav<T extends { id: string }>({ items, scope, onOpen }: ListNavOptions<T>) {
  const [activeIndex, setActiveIndex] = useState(0);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Keep activeIndex valid if the items array shrinks (e.g., filter).
  useEffect(() => {
    if (activeIndex >= items.length) setActiveIndex(Math.max(0, items.length - 1));
  }, [items.length, activeIndex]);

  const scrollActiveIntoView = useCallback(
    (index: number) => {
      const target = items[index];
      if (!target) return;
      const el = rowRefs.current.get(target.id);
      el?.scrollIntoView({ block: "nearest" });
    },
    [items],
  );

  const bind = useCallback(
    (item: T) => ({
      "data-list-nav-id": item.id,
      "data-active": items[activeIndex]?.id === item.id || undefined,
      ref: (el: HTMLElement | null) => {
        if (el) rowRefs.current.set(item.id, el);
        else rowRefs.current.delete(item.id);
      },
      onClick: () => {
        const idx = items.findIndex((i) => i.id === item.id);
        if (idx >= 0) setActiveIndex(idx);
      },
    }),
    [items, activeIndex],
  );

  const shortcuts: Shortcut[] = [
    {
      id: `list-${scope}-next`,
      keys: ["j"],
      label: "Next row",
      group: "List",
      run: () => {
        setActiveIndex((i) => {
          const next = Math.min(items.length - 1, i + 1);
          scrollActiveIntoView(next);
          return next;
        });
      },
    },
    {
      id: `list-${scope}-prev`,
      keys: ["k"],
      label: "Previous row",
      group: "List",
      run: () => {
        setActiveIndex((i) => {
          const next = Math.max(0, i - 1);
          scrollActiveIntoView(next);
          return next;
        });
      },
    },
    {
      id: `list-${scope}-open`,
      keys: ["enter"],
      label: "Open selected row",
      group: "List",
      run: () => {
        const item = items[activeIndex];
        if (item && onOpen) onOpen(item);
      },
    },
    {
      id: `list-${scope}-bottom`,
      keys: ["shift+g"],
      label: "Jump to last row",
      group: "List",
      run: () => {
        const next = Math.max(0, items.length - 1);
        setActiveIndex(next);
        scrollActiveIntoView(next);
      },
    },
  ];

  useRegisterShortcut(shortcuts);

  return {
    activeIndex,
    activeId: items[activeIndex]?.id,
    setActiveIndex,
    bind,
  };
}
