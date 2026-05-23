# Old Guard CRM Deep Dive

> Research note for the Ep. 3 build. Sources captured live via `interceptor` on 2026-05-18: vendor product/feature pages for Salesforce Sales Cloud (Agentforce), HubSpot, Pipedrive, Zoho, Microsoft Dynamics 365 Sales. Cross-referenced with our brief in [`REQUIREMENTS.md`](../../REQUIREMENTS.md) and the build plan in [`01-crm-assessment.md`](./01-crm-assessment.md).

## TL;DR

The "old guard" — Salesforce, HubSpot, Pipedrive, Zoho, Dynamics — has long since converged on the **same table-stakes feature surface**. The differentiation today is no longer the data model (everybody has Accounts/Contacts/Deals/Activities/Tickets); it's:

1. **AI agents layered on top of the existing object model** (Salesforce Agentforce, HubSpot Breeze, Zoho Zia, Pipedrive AI Sales Assistant, Dynamics Copilot Sales Agent).
2. **Email/calendar capture** that auto-logs activity into the timeline ("activity capture" / "inbox" / "smart sync").
3. **A pipeline kanban** as the centerpiece UI on the rep dashboard.
4. **Prioritized to-do / "next best action"** lists that combine open tasks, follow-ups, ticket SLAs, and lead score.
5. **An app marketplace / integration library** with hundreds-to-thousands of prebuilt connectors plus a REST API + webhooks layer for the long tail.

For our 6-hour build, **none of this is technically hard** — it's a CRUD app over a relational schema with a kanban and a timeline. The hard part is what the old guard takes for granted: a **plausible, polished demo** in which judges open a URL cold and instantly recognize "this is a CRM." Anything that doesn't reinforce that recognition is luxury.

The single thing we should consciously *not* copy from the old guard: the surface-area explosion. Salesforce's Sales Cloud has 9 product sub-modules visible just on the landing page. We have six hours.

## The shared feature surface (table stakes)

Below is the union of features that **every** old-guard vendor ships and markets as core. Anything here that's missing from our app will read as "not a CRM" to a judge — even if it's not in `REQUIREMENTS.md` verbatim.

| Area | Salesforce | HubSpot | Pipedrive | Zoho | Dynamics 365 |
|---|---|---|---|---|---|
| **Contact mgmt** (CRUD, dedupe, custom fields) | ✓ | ✓ | ✓ | ✓ (Canvas, custom layouts) | ✓ |
| **Company / Account mgmt** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Deal/opportunity records + custom stages** | ✓ | ✓ Deals | ✓ Pipelines | ✓ Pipeline + Blueprint | ✓ |
| **Pipeline kanban** (drag-to-stage) | ✓ | ✓ Deal board | ✓ (the brand identity) | ✓ | ✓ |
| **Activities timeline** (email, call, meeting, note) | ✓ | ✓ Task & activities | ✓ | ✓ Cadences | ✓ |
| **Email send + tracking** (open/click) | ✓ Sales Engagement | ✓ Email tracking + templates | ✓ Email tools | ✓ Email integration | ✓ |
| **Calendar integration** | ✓ | ✓ Meetings | ✓ | ✓ | ✓ |
| **Lead capture / web forms** | ✓ | ✓ Form builder + Lead gen | ✓ Web forms | ✓ Lead capture | ✓ |
| **Lead scoring** | ✓ | ✓ Contact scoring (Pro+) | ✓ AI scoring | ✓ Zia scoring | ✓ Sales Qualification Agent |
| **Task / to-do list** | ✓ | ✓ | ✓ Focus View | ✓ | ✓ |
| **Reports / dashboard** | ✓ Sales Analytics + Tableau | ✓ Reporting dashboard | ✓ Insights & reports | ✓ BI dashboards | ✓ |
| **Tickets / customer service** | ✓ Service Cloud (separate) | ✓ Ticketing (in free tier!) | ✗ (integrations only) | ✓ via Desk | ✓ Customer Service (separate) |
| **Workflow automation** | ✓ Flow | ✓ Workflows | ✓ Automation + open API | ✓ Workflows + Journey Orchestration | ✓ Power Automate |
| **Webhooks / open API** | ✓ | ✓ (apps marketplace) | ✓ webhooks + REST | ✓ | ✓ |
| **Role-based permissions** | ✓ | ✓ (Starter+) | ✓ | ✓ | ✓ |
| **Mobile app** | ✓ | ✓ | ✓ (incl. offline notes, "Nearby") | ✓ | ✓ |
| **AI agent / assistant** | ✓ Agentforce (the new headline) | ✓ Breeze Assistant | ✓ AI Sales Assistant | ✓ Zia | ✓ Copilot Sales / Sales Qualification Agent |
| **Free tier with credit-card-less signup** | ✓ (limited) | ✓ (the headline) | 14-day trial | 15-day trial | 30-day trial |

The pattern is **complete and homogenous**. There is no meaningful gap in any vendor's table-stakes surface; vendors compete on price, polish, depth-per-area, and ecosystem.

## What "AI" looks like inside the old guard

This is where the old guard is racing to catch up to the new guard. Each vendor has rebranded its assistant in the last 18 months and is selling AI as a top-line feature.

```mermaid
flowchart LR
  subgraph user["What the rep sees"]
    rep["Sales rep<br/>opens CRM"]
  end

  subgraph ai["AI surface"]
    summarize["Summarize record<br/>(emails, calls, notes)"]
    next["Suggest next action"]
    draft["Draft email / reply"]
    score["Score lead / deal"]
    update["Auto-update fields"]
  end

  subgraph data["CRM record"]
    contact[("Contact")]
    deal[("Deal")]
    timeline[("Activities timeline")]
  end

  subgraph signals["Signals"]
    email["Inbox / calendar"]
    call["Call recording"]
    web["Web visits"]
    intent["Intent data"]
  end

  email --> timeline
  call --> timeline
  web --> timeline
  intent --> score

  timeline --> summarize
  summarize --> rep
  contact --> next
  next --> rep
  score --> next
  draft --> rep
  update --> contact
```

### Vendor-by-vendor on the AI layer

- **Salesforce — Agentforce Sales (formerly Einstein/Sales Cloud)**: "Sellers focus on winning. Agents handle the grind." Positions agents as a *digital workforce* working hand-in-hand with reps across prospecting, pipeline, account growth. Marketing line: "30% more revenue, 25 hours/week back per seller." Concrete agents shipped: prospecting agent, pipeline agent, account-growth agent, partner-success agent. The pitch is autonomous, multi-stage, but anchored in the existing Sales Cloud data model.
- **HubSpot — Breeze**: "Your digital teammate." Breeze Assistant does record summarization, call prep, content drafting. Breeze AI customer agent is gated to Professional ($50/seat/mo). Notably HubSpot is the only one that ships **ticketing in the free tier** and the only one selling "Set up in minutes, no IT support" as a key differentiator. Their wedge against Salesforce is consumerized UX + free CRM.
- **Pipedrive — AI Sales Assistant + AI email writer/summarizer + AI reporting (15+ prompts)**: Lighter touch — assistant nudges, drafts, summarizes. The brand identity remains the pipeline kanban; AI is sidecar.
- **Zoho — Zia**: Conversational AI tied tightly to Zoho's automation primitives (Blueprint, Cadences, Journey Orchestration, Kiosk Studio). Notable: **Zoho is the only old-guard vendor that ships true visual journey orchestration as a first-party feature**, not as a marketplace add-on.
- **Dynamics 365 — Copilot Sales / Sales Qualification Agent**: "We're shifting from the idea that CRM is just a reporting tool. With agents, we're making CRM a way of life." Sales Qualification Agent is the headlining autonomous agent — qualifies inbound leads end-to-end. Built on the Power Platform so customers can compose their own agents.

## Mapping to our requirements

Re-reading the four MUST-DOs from `REQUIREMENTS.md` through the old-guard lens:

| Our requirement | Old-guard equivalent | What we can crib for the demo |
|---|---|---|
| **MUST 1**: Rep logs in → sees assigned customers + leads | "Assigned to me" filter on Contacts/Leads (universal) | Two tabs at top of rep home: **My Customers** \| **My Leads**. Default filter `assigned_rep_id = me`. |
| **MUST 2**: Drill into prioritized action list | Salesforce "To Do List" / HubSpot Tasks / Pipedrive "Focus View" — none truly prioritize for you, they show what you queued | **Our differentiator**: a *computed* priority score, not a manual queue. SQL view ranking `(open_tickets × 3) + lead_score + days_since_contact + ideal_customer_flag × N`. One column, sorted. |
| **MUST 3**: CRUD customer records | Universal | Cheap forms, custom fields not required. |
| **MUST 4**: Cross-property activity ingestion → CRM record | Salesforce "Sales Engagement" + "Data 360", HubSpot data sync, Zoho integrations | Our `/v1/ingest` endpoint with identity resolution (already designed in [`01-crm-assessment.md`](./01-crm-assessment.md)). **This is genuinely the same pattern as the big vendors' "Customer Data" layer.** |

### Feature-surface items judges will look for but don't test

From the brief's feature list:

- **Customer profiles** → universal. Implement: contact panel + company link + activity timeline + recent deals.
- **Company profiles** → universal. Implement: company panel + employees list + deal pipeline filtered to this company.
- **Sales-rep profile** → less universal as a first-class page in old guard (more often a filter context); we should still ship one since the brief asks for it.
- **Sales-rep dashboard with trends** → universal. Recharts (MIT) gets us pretty graphs in 30 min: activity-over-time, leads-by-stage, ticket-SLA.
- **Activity tracking — in-app actions, email, manual notes, purchase history, "ideal customer" flags** → universal. Ours is fed by `/v1/ingest`. Ideal-customer flag = SQL view, render as a chip.
- **Lead management — pipeline, LTV, conversation history, automated follow-up** → universal. We ship pipeline kanban + a single LTV column + a "follow-up due" computed field. Automated follow-up = a cron Worker that emails `next_step_due < now()` rows.
- **Customer service — tickets, SLA alerting** → only HubSpot ships this in the free tier; everyone else makes you buy Service Cloud / Zoho Desk separately. **We can punch above our weight here** by shipping tickets + SLA inline.
- **Stretch: webhook-ready outbound triggers** → universal-but-paywalled in the old guard. For us, this is just `event_type → URL` fan-out via Cloudflare Queues. A 30-minute build.
- **Stretch: agentic daily report** → this is where the new guard lives (see `new-guard.md`). Old guard sells it but mostly via add-ons.

## What's worth stealing (concretely)

For the build, copy these old-guard conventions verbatim — they're load-bearing for the "this is a CRM" recognition moment:

1. **The pipeline kanban as the primary deal view**. Five columns: `Lead → Qualified → Proposal → Negotiation → Closed`. Drag-and-drop. This is the visual shorthand for "I'm in a CRM." Even HubSpot's free tier leads with this. [Recharts isn't needed for this — `react-beautiful-dnd` or a CSS-grid kanban is enough.]
2. **The activity timeline on every customer/company record**. Reverse-chronological. Icons per activity type. Inline note creation. This is what reps look at all day.
3. **"Assigned to me" as the default scope** on every list view. Toggle to "All" exists but defaults hide it.
4. **The right rail: contact details (name, email, phone, company link) + recent deals + next action**. Three-pane layout (list | record | rail) is universal old-guard convention.
5. **Tickets inline with the customer record**, not a separate app. HubSpot is the only old-guard vendor that gets this right out of the box; the others make it a separate product.
6. **A "log a call" / "log a note" button** at the top of every record. Manual offline activity entry is explicitly in our brief.
7. **Reports as cards on the rep dashboard**, not a separate analytics app. Four cards: deals by stage, activity over time, leads by source, tickets by status. That's enough to satisfy "trends, key activities, and other relevant metrics."

## What to consciously *not* copy

- **Sub-modules and tabs**. Salesforce has Sales Cloud, Sales Engagement, Sales Programs, Buyer Engagement, Sales Data, Sales Analytics, Sales Team Productivity, Revenue Intelligence, RLM/CPQ, Sales Performance Management, PRM. We have **one app**. One sidebar. Six top-level routes max: `Home`, `Customers`, `Companies`, `Leads`, `Deals`, `Tickets`.
- **Custom-object builders, "Canvas," "Kiosk Studio," "Blueprint" visual builders**. These are 6-month projects, not 6-hour ones.
- **OAuth-everything**. Magic link is fine. Brief doesn't require enterprise SSO.
- **A separate marketing-cloud / engagement-cloud product**. Our "automated follow-up" is a cron over D1.
- **Plan tiers**. Demo is single-tenant for judges; no pricing page.

## The deployment story old guard tells, and what we should imitate

Every old-guard landing page leads with **time-to-first-value**:

- HubSpot: "Get Set Up in Minutes, Without IT Support... Your browser is all you need."
- Salesforce: "Try free for 30 days. No credit card, no installations."
- Pipedrive: 14-day no-credit-card trial.

Judges open our URL cold. **Our onboarding modal on first login is non-negotiable** — explain the three things they're about to see (customers list, prioritized action list, where ingest fires from). The new guard has mostly abandoned this — they assume an account exec demoing them. We do *not* have that luxury.

## Pricing observations (signal of what they think table stakes is)

Looking at where features sit in tiering tells us what the market *actually* considers core vs premium:

- **Free / starter** universally includes: contact mgmt, deals, pipelines, basic email, single dashboard, mobile app. (This is our MVP target.)
- **Mid-tier** ($50/seat/mo neighborhood, e.g. HubSpot Pro) adds: workflow automation, AI assistant, contact scoring, custom reports, ticketing depth.
- **Enterprise** adds: custom objects, advanced permissions, SSO, multi-team org, audit logs.

For a 6-hour MVP, **shipping the free/starter band end-to-end is the bar**. Touch one or two mid-tier features (workflow automation + AI assistant) for taste.

## Open questions that fall out of this research

1. **Pipeline kanban vs prioritized action list — which is the front door?** Old guard mostly defaults to the pipeline kanban. Our brief leans on the prioritized action list ("a sales representative must be able to drill down into a prioritized list of actions"). I'd argue we make the **action list** our home view (it satisfies the brief verbatim and is more differentiated) and the pipeline kanban a one-click-away tab. The action list is the new-guard move; the kanban is the old-guard move. We blend.
2. **Tickets: in-line with customer record, or separate page?** HubSpot's "tickets in free tier" suggests in-line is the move. Brief asks for tickets explicitly. In-line wins; we add a "Tickets" top-level only for the "open tickets queue" view.
3. **Email send capability — do we ship it?** Old guard universally ships it. For our 6h build, "log an email" (manual entry) is enough to satisfy "email activity" in the brief; actually sending email out of the CRM is a nice-to-have. Defer.

## Sources (interceptor pulls, 2026-05-18)

- [Salesforce Sales Cloud / Agentforce](https://www.salesforce.com/sales/)
- [HubSpot CRM](https://www.hubspot.com/products/crm)
- [Pipedrive features](https://www.pipedrive.com/en/features)
- [Zoho CRM features](https://www.zoho.com/crm/features.html)
- [Microsoft Dynamics 365 Sales](https://dynamics.microsoft.com/en-us/sales/overview/)
