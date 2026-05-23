import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { KbdHint } from "@/components/kbd-hint";
import { useShortcuts, type ShortcutGroup } from "@/hooks/use-shortcuts";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const GROUP_ORDER: ShortcutGroup[] = ["Global", "Navigation", "Action", "List", "Search"];

export function ShortcutsDialog({ open, onOpenChange }: Props) {
  const shortcuts = useShortcuts();
  const grouped = useMemo(() => {
    const m = new Map<ShortcutGroup, typeof shortcuts>();
    // This dialog is the keyboard cheat sheet — actions registered for the
    // command palette without a hotkey would render as a blank kbd, so skip
    // them here. They still show up in the palette.
    for (const s of shortcuts) {
      if (!s.keys[0]) continue;
      const arr = m.get(s.group) ?? [];
      arr.push(s);
      m.set(s.group, arr);
    }
    return m;
  }, [shortcuts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <KbdHint keys="mod+k" tone="accent" force /> to start. Available on this page
            only.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2 max-h-[60vh] overflow-y-auto">
          {GROUP_ORDER.filter((g) => grouped.has(g)).map((g) => (
            <section key={g}>
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                {g}
              </h3>
              <ul className="space-y-1.5">
                {grouped.get(g)!.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-sm">
                    <span>{s.label}</span>
                    <KbdHint keys={s.keys[0]} force />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
