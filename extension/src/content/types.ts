/**
 * Activity-capture types shared by the content-script adapters.
 *
 * An adapter observes one comms surface (Gmail, Outlook, LinkedIn, Teams) and
 * emits `ActivityEvent`s. The service worker forwards them to the RepAgent DO
 * as protocol `activity_event` frames; the DO resolves the counterparty and
 * writes a CRM activity row. Spec: shared/agent-ws-protocol.md v0.2.
 */

import type { SiteId } from "../background/sites";

export type ActivityKind =
  | "email_sent"
  | "email_received"
  | "linkedin_comment"
  | "linkedin_message"
  | "teams_message";

export interface ActivityContact {
  email?: string;
  name?: string;
  profileUrl?: string;
}

export interface ActivityEvent {
  kind: ActivityKind;
  site: SiteId;
  /** epoch ms when the event was observed. */
  occurredAt: number;
  /** the person the rep communicated with — backend resolves against contacts. */
  contact?: ActivityContact;
  subject?: string;
  preview?: string;
  /** page URL where the event was captured. */
  url?: string;
  /** stable per logical event — dedups in the page and in the service worker. */
  dedupeKey: string;
}

export type EmitFn = (event: ActivityEvent) => void;

/** An adapter attaches observers/listeners and returns a teardown function. */
export type Adapter = (emit: EmitFn) => () => void;
