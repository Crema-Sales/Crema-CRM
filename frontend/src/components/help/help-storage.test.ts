import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pushHelpFeedback, pushRecentHelp, readHelpFeedback, readRecentHelp } from "./help-storage";

class MemoryStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  const storage = new MemoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage: storage } as unknown as Window &
    typeof globalThis;
});

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
  vi.restoreAllMocks();
});

describe("pushRecentHelp", () => {
  it("stores the entry with the supplied timestamp", () => {
    pushRecentHelp({ id: "funnel", title: "Funnel", path: "/funnel" }, 1000);
    expect(readRecentHelp()).toEqual([
      { id: "funnel", title: "Funnel", path: "/funnel", ts: 1000 },
    ]);
  });

  it("places the newest entry first", () => {
    pushRecentHelp({ id: "funnel", title: "Funnel", path: "/funnel" }, 1000);
    pushRecentHelp({ id: "today", title: "Today", path: "/today" }, 2000);
    const recent = readRecentHelp();
    expect(recent.map((e) => e.id)).toEqual(["today", "funnel"]);
  });

  it("dedupes by id and refreshes the timestamp", () => {
    pushRecentHelp({ id: "funnel", title: "Funnel", path: "/funnel" }, 1000);
    pushRecentHelp({ id: "today", title: "Today", path: "/today" }, 2000);
    pushRecentHelp({ id: "funnel", title: "Funnel", path: "/funnel" }, 3000);
    const recent = readRecentHelp();
    expect(recent.map((e) => e.id)).toEqual(["funnel", "today"]);
    expect(recent[0].ts).toBe(3000);
  });

  it("caps the list at 5 entries, newest first", () => {
    for (let i = 0; i < 8; i++) {
      pushRecentHelp({ id: `t${i}`, title: `T${i}`, path: `/t${i}` }, 1000 + i);
    }
    const recent = readRecentHelp();
    expect(recent.length).toBe(5);
    expect(recent.map((e) => e.id)).toEqual(["t7", "t6", "t5", "t4", "t3"]);
  });

  it("survives a corrupt localStorage payload", () => {
    window.localStorage.setItem("crema:help:recent", "{not json");
    pushRecentHelp({ id: "funnel", title: "Funnel", path: "/funnel" }, 1000);
    expect(readRecentHelp()).toEqual([
      { id: "funnel", title: "Funnel", path: "/funnel", ts: 1000 },
    ]);
  });

  it("drops entries that fail the schema check", () => {
    window.localStorage.setItem(
      "crema:help:recent",
      JSON.stringify([
        { id: "funnel", title: "Funnel", path: "/funnel", ts: 1000 },
        { id: 42, title: "Bad", path: "/x", ts: 2000 },
      ]),
    );
    expect(readRecentHelp()).toEqual([
      { id: "funnel", title: "Funnel", path: "/funnel", ts: 1000 },
    ]);
  });
});

describe("pushHelpFeedback", () => {
  it("appends entries chronologically", () => {
    pushHelpFeedback({ topic: "funnel", value: "up" }, 1000);
    pushHelpFeedback({ topic: "today", value: "down" }, 2000);
    expect(readHelpFeedback()).toEqual([
      { topic: "funnel", value: "up", ts: 1000 },
      { topic: "today", value: "down", ts: 2000 },
    ]);
  });

  it("caps at 50, dropping the oldest entries", () => {
    for (let i = 0; i < 55; i++) {
      pushHelpFeedback({ topic: `t${i}`, value: i % 2 === 0 ? "up" : "down" }, i);
    }
    const feedback = readHelpFeedback();
    expect(feedback.length).toBe(50);
    expect(feedback[0]).toEqual({ topic: "t5", value: "down", ts: 5 });
    expect(feedback[49]).toEqual({ topic: "t54", value: "up", ts: 54 });
  });

  it("filters out malformed entries on read", () => {
    window.localStorage.setItem(
      "crema:help:feedback",
      JSON.stringify([
        { topic: "funnel", value: "up", ts: 1000 },
        { topic: "today", value: "sideways", ts: 2000 },
        { topic: "tickets", value: "down" },
      ]),
    );
    expect(readHelpFeedback()).toEqual([{ topic: "funnel", value: "up", ts: 1000 }]);
  });
});
