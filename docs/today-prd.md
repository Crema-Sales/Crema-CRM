# PRD — Today

> The sales rep's landing page. Answers "what do I do right now?" in under five seconds. Focused on the to-do list and the top relationships behind it.
>
> **Route:** `/today` · **Replaces:** `frontend/src/routes/_authenticated/today.tsx` · **Server fn:** `getToday` in `frontend/src/lib/crm.functions.ts`

---

## 1. Problem

A sales rep logging in needs to know, immediately:

1. Which relationships matter most right now?
2. What concrete actions do I owe?

Everything else — list views, kanban, search, stage filters — is for when they already know what they're looking for. Today is the page for when they don't.

Today is also the judging surface for the brief's core requirement: *"A sales representative must be able to drill down into a prioritized list of actions, such as contacting leads, checking in with existing customers, following up on support tickets, etc."* (`REQUIREMENTS.md:61`).

## 2. Goals

- **Primary:** A rep can open Today and start working within 5 seconds — no filtering, no searching.
- **Secondary:** Surface the highest-value relationships at a glance so the rep knows where to push.
- **Tertiary:** Make task completion the lightest possible interaction — one click, no page change.

### Non-goals

- Stuck / aging-stage analytics (lives on `/funnel`).
- "Customers needing attention" / activity-recency callouts (lives on `/relationships` and `/activity`).
- Pipeline visualization (lives on `/funnel` and `/deals`).
- Bulk editing or list-management ergonomics (lives on `/relationships`, `/contacts`).
- Manager rollups / team dashboards (rep-only view).

## 3. User & Use Cases

**Persona:** Sales rep, signed in, assigned relationships via `relationships.owner_id`.

**Core jobs:**
- "I just sat down with coffee. What's the most important thing to push on?"
- "Between meetings — give me one task I can knock out in 2 minutes."
- "Which of my deals are worth the most expected revenue right now?"

## 4. Information Architecture

Two sections plus the quota card. That's it.

| # | Section | Source | Definition | Empty state |
|---|---------|--------|------------|-------------|
| 0 | **Quota card** | `QuotaCard` component | This rep's progress toward period quota | Hidden if no quota set |
| 1 | **Top relationships** | `data.top` | Owner's non-archived relationships, joined to open deals, ranked by `SUM(deals.value × deals.probability/100)` for deals not in `won`/`lost`. Limit 10. | "No relationships yet. Head to Relationships to add one." |
| 2 | **Open tasks** | `data.tasks` | `tasks` rows for this owner where `completed = 0`. Unbounded. | "All clear. Pour another cup." |

Section header pattern: icon + serif title + count + uppercase mono-caption explaining the rule. The caption is load-bearing — it tells the rep *why* this row showed up.

## 5. Interactions

### Top relationship row
- **Click** → navigates to `/relationships`. (No per-relationship detail route exists yet; the relationships list is the drill-down surface.)
- **Hover** → border accent.
- **Right side** shows the expected open-deal value (e.g. `$84k expected`) and, when present, an "N open deals" caption.

### Task row
- **Checkbox** → optimistic toggle via `toggleTask` server fn, invalidates the `["today"]` query. No page change.
- **Priority chip** (`urgent` / `high` / `low`) — `urgent` is destructive/red, `high` is the brand accent, `low` is muted. `medium` is the default and renders no chip to reduce noise.
- **Stage badge** (`STAGE_LABEL`) — read-only chip showing which funnel stage seeded this task.
- **Overdue tasks** (`due_at < now`): caption renders as `overdue · <distance>` in `text-destructive font-semibold`. (Overdue sort behavior is described in §6.)

### Loading & errors
- Loading: render section skeletons. Avoid layout shift.
- Error: full-page boundary with retry button. Today is the landing page; a blank screen is unacceptable.
- Empty (new rep, no relationships and no tasks): show the `NewRepEmptyState` card with a CTA to `/relationships`.

## 6. Prioritization Rules (the "why this row" contract)

A rep should be able to read the caption and predict the contents.

- **Top relationships:** non-archived, `owner_id = me`. Sort: expected open-deal value DESC, then `status_entered_at` DESC. Limit 10.
- **Open tasks:** `completed = 0` AND `owner_id = me`. Sort, in order: `priority` (urgent → high → medium → low), then overdue-first within a priority tier, then `due_at ASC` with nulls last.

## 7. Data Contract

`getToday` returns:

```ts
{
  top: Relationship[];
  tasks: Task[];
}
```

`Relationship` fields used by the UI: `id`, `name`, `status`, `status_entered_at`, `company_name` (from `relationship_companies` where `is_primary = 1`), `expected_value` (computed), `open_deals` (computed).

`Task` fields used by the UI: `id`, `title`, `completed`, `due_at`, `priority`, `stage_key`. Other selected columns (`description`, `related_deal_id`, `related_contact_id`, `related_ticket_id`, `created_at`) are returned but not yet rendered.

### Server-side notes
- Single grouped query against `relationships LEFT JOIN deals … LEFT JOIN relationship_companies (is_primary) … LEFT JOIN companies`. Computes `expected_value` and `open_deals` inline.
- Tasks query selects explicit columns (not `SELECT *`) to keep the wire payload predictable.
- All sections come back in a single round trip and are cached under the `["today"]` query key. Refetch on task toggle only.

## 8. Success Metrics

- **Time-to-first-action:** seconds from `/today` mount to first task toggle or relationship click. Target: median < 15s.
- **Task completion rate:** % of tasks created that get toggled within 72 hours of `due_at`. Target: > 60%.
- **Return engagement:** % of rep sessions that start on Today. Target: > 80%.

---

## Appendix: Current implementation snapshot

- Page: `frontend/src/routes/_authenticated/today.tsx`
- Server fn: `frontend/src/lib/crm.functions.ts` (`getToday`)
- Task toggle: `toggleTask` in `frontend/src/lib/crm.functions.ts`
- Help content: `frontend/src/components/help/content/today-help.tsx`
- Quota card: `@/components/quota-card`
