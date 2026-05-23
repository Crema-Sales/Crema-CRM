// Re-export every inferred TS type from the schemas so consumers can do
// `import type { Customer } from "@crema/shared/types"` without pulling
// the runtime zod schemas. Schemas remain the canonical source of truth.
export type {
  Customer,
  CustomerCreate,
  CustomerPatch,
  CustomerListQuery,
  CustomerListResponse,
  CustomerStatus,
} from "../schemas/customer";
export type {
  Lead,
  LeadPatch,
  LeadListQuery,
  LeadListResponse,
  LeadDraft,
  LeadStage,
} from "../schemas/lead";
export type {
  Ticket,
  TicketPatch,
  TicketListQuery,
  TicketListResponse,
  TicketStatus,
  TicketPriority,
} from "../schemas/ticket";
export type {
  Activity,
  ActivityListQuery,
  ActivityListResponse,
  ActivityNoteCreate,
  ActivityType,
  ActivitySource,
} from "../schemas/activity";
export type {
  PrioritizedAction,
  ActionListResponse,
  ActionKind,
} from "../schemas/action";
export type {
  Relationship,
  RelationshipCreate,
  RelationshipPatch,
  RelationshipContactAttach,
  RelationshipCompanyAttach,
  RelationshipStatus,
} from "../schemas/relationship";
export type { ErrorBody, ErrorCode } from "../schemas/error";
export type {
  ResearchJob,
  ResearchJobStatus,
  ResearchJobResponse,
  ResearchJobListResponse,
  ResearchJobResult,
  ResearchStartRequest,
  ResearchStartResponse,
  ProspectAffinities,
  ProspectGiftIdea,
  ProspectSource,
  ProspectSocial,
  ProspectPostMention,
  ProspectTalk,
  ProspectFamilyKid,
  ProspectFamilyPet,
  GiftDraft,
  GiftDraftListResponse,
  GiftDraftRequest,
} from "../schemas/research";
export type { Resource } from "../schemas/index";
