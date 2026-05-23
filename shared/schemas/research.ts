import { z } from "@hono/zod-openapi";

/**
 * `research.ts` — schemas for the agentic OSINT prospect-research stack.
 *
 * The point of this surface isn't a CRM-style enrichment dump — it's
 * *gift-actionable signals*: things a rep can use to send a thoughtful
 * object ("Stars tickets for that big game", "a sleeve of his favorite
 * cigar") that opens a relationship door no email ever will. Every claim
 * that touches the personal / family blocks must come with at least one
 * `source_urls` entry so reps can sanity-check before they spend money.
 */

export const RESEARCH_JOB_STATUSES = [
  "pending",
  "running",
  "complete",
  "failed",
] as const;

export const ResearchJobStatus = z
  .enum(RESEARCH_JOB_STATUSES)
  .openapi("ResearchJobStatus");

export const ProspectSource = z
  .object({
    url: z.string().url(),
    snippet: z.string().optional().openapi({
      description: "Short excerpt that supports a claim sourced from this page",
    }),
    retrievedAt: z.iso.datetime(),
  })
  .openapi("ProspectSource");

export const ProspectSocial = z
  .object({
    platform: z.string().openapi({ example: "linkedin" }),
    handle: z.string().nullable().optional(),
    url: z.string().url(),
  })
  .openapi("ProspectSocial");

export const ProspectPostMention = z
  .object({
    url: z.string().url(),
    title: z.string().optional(),
    summary: z.string().optional(),
    publishedAt: z.iso.datetime().nullable().optional(),
  })
  .openapi("ProspectPostMention");

export const ProspectTalk = z
  .object({
    event: z.string(),
    year: z.number().int().nullable().optional(),
    topic: z.string().optional(),
    url: z.string().url().nullable().optional(),
  })
  .openapi("ProspectTalk");

export const ProspectFamilyKid = z
  .object({
    name: z.string().nullable().optional(),
    ageEstimate: z.string().nullable().optional().openapi({
      description: "Rough bucket — 'toddler', '~7', 'teenager'. Never assert exact age.",
    }),
    interests: z.array(z.string()).default([]),
  })
  .openapi("ProspectFamilyKid");

export const ProspectFamilyPet = z
  .object({
    species: z.string().openapi({ example: "dog" }),
    name: z.string().nullable().optional(),
    breed: z.string().nullable().optional(),
  })
  .openapi("ProspectFamilyPet");

export const ProspectGiftIdea = z
  .object({
    idea: z.string().openapi({
      example: "Pair of Dallas Stars tickets, lower bowl, any home game vs Avalanche",
    }),
    rationale: z.string().openapi({
      description: "Why this idea fits, in one sentence — references specific signals.",
    }),
    priceBand: z.enum(["$", "$$", "$$$"]),
    sourceUrls: z
      .array(z.string().url())
      .min(1)
      .openapi({
        description:
          "URLs that back the signals this idea is built on. Mandatory — no idea without citations.",
      }),
  })
  .openapi("ProspectGiftIdea");

export const ProspectAffinities = z
  .object({
    professional: z
      .object({
        currentRole: z.string().nullable().optional(),
        company: z.string().nullable().optional(),
        recentPosts: z.array(ProspectPostMention).default([]),
        podcastsAppearedOn: z.array(ProspectPostMention).default([]),
        talksGiven: z.array(ProspectTalk).default([]),
        almaMater: z.array(z.string()).default([]),
        socials: z.array(ProspectSocial).default([]),
      })
      .default({
        recentPosts: [],
        podcastsAppearedOn: [],
        talksGiven: [],
        almaMater: [],
        socials: [],
      }),
    personal: z
      .object({
        sportsTeams: z.array(z.string()).default([]),
        hobbies: z.array(z.string()).default([]),
        favoriteMedia: z.array(z.string()).default([]),
        causes: z.array(z.string()).default([]),
        foodDrink: z
          .object({
            dietary: z.string().nullable().optional(),
            preferences: z.array(z.string()).default([]),
          })
          .default({ preferences: [] }),
        hometown: z.string().nullable().optional(),
      })
      .default({
        sportsTeams: [],
        hobbies: [],
        favoriteMedia: [],
        causes: [],
        foodDrink: { preferences: [] },
      }),
    family: z
      .object({
        spouse: z
          .object({
            name: z.string().nullable().optional(),
            interests: z.array(z.string()).default([]),
          })
          .nullable()
          .optional(),
        kids: z.array(ProspectFamilyKid).default([]),
        pets: z.array(ProspectFamilyPet).default([]),
      })
      .default({ kids: [], pets: [] }),
    giftIdeas: z.array(ProspectGiftIdea).default([]),
    confidence: z.enum(["high", "medium", "low"]).default("low"),
    summary: z.string().openapi({
      description:
        "2-3 sentence prose summary of the prospect — what kind of person they are, what they care about, the best angle for connection.",
    }),
    sources: z.array(ProspectSource).default([]),
  })
  .openapi("ProspectAffinities");

export const ResearchJob = z
  .object({
    id: z.string().openapi({ example: "rsh_01HQK9..." }),
    customerId: z.string(),
    repId: z.string(),
    status: ResearchJobStatus,
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    /** @description Free-text seed hint the rep can pass in ("focus on the hockey angle"). Optional. */
    hint: z.string().nullable(),
    /** @description Structured affinities (only present once status === 'complete'). */
    affinities: ProspectAffinities.nullable(),
    /** @description Set when status === 'failed'. */
    error: z.string().nullable(),
    /** @description Number of inner-loop steps taken. */
    steps: z.number().int().nonnegative().default(0),
  })
  .openapi("ResearchJob");

export const ResearchStartRequest = z
  .object({
    hint: z.string().max(500).optional().openapi({
      description:
        "Optional free-text steer for the researcher ('focus on hockey', 'find his Goodreads').",
    }),
  })
  .openapi("ResearchStartRequest");

export const ResearchStartResponse = z
  .object({
    job: ResearchJob,
  })
  .openapi("ResearchStartResponse");

export const ResearchJobResponse = z
  .object({
    job: ResearchJob,
  })
  .openapi("ResearchJobResponse");

export const ResearchJobListResponse = z
  .object({
    items: z.array(ResearchJob),
    next_cursor: z.string().nullable(),
  })
  .openapi("ResearchJobListResponse");

/**
 * Internal payload — RepAgent DO POSTs this back into the API once the
 * inner loop finishes. Not exposed in the public OpenAPI doc; used over
 * the SELF binding only.
 */
export const ResearchJobResult = z
  .object({
    status: z.enum(["complete", "failed"]),
    affinities: ProspectAffinities.optional(),
    error: z.string().optional(),
    steps: z.number().int().nonnegative(),
  })
  .openapi("ResearchJobResult");

export const GiftDraft = z
  .object({
    id: z.string().openapi({ example: "gft_01HQK9..." }),
    customerId: z.string(),
    repId: z.string(),
    researchJobId: z.string().nullable(),
    idea: z.string(),
    rationale: z.string(),
    priceBand: z.enum(["$", "$$", "$$$"]),
    suggestedVendor: z.string().nullable(),
    draftNote: z.string().openapi({
      description: "Personal note draft to ship with the gift. Rep reviews and edits before sending.",
    }),
    sourceUrls: z.array(z.string().url()),
    createdAt: z.iso.datetime(),
  })
  .openapi("GiftDraft");

export const GiftDraftListResponse = z
  .object({
    items: z.array(GiftDraft),
    next_cursor: z.string().nullable(),
  })
  .openapi("GiftDraftListResponse");

export const GiftDraftRequest = z
  .object({
    researchJobId: z.string().optional().openapi({
      description: "Specific research job to draft from. Defaults to the most recent complete job for this customer.",
    }),
    priceBand: z.enum(["$", "$$", "$$$"]).optional(),
    hint: z.string().max(300).optional().openapi({
      description: "Optional steer ('keep it under $50', 'something for his daughter')",
    }),
  })
  .openapi("GiftDraftRequest");

export type ResearchJobStatus = z.infer<typeof ResearchJobStatus>;
export type ProspectSource = z.infer<typeof ProspectSource>;
export type ProspectSocial = z.infer<typeof ProspectSocial>;
export type ProspectPostMention = z.infer<typeof ProspectPostMention>;
export type ProspectTalk = z.infer<typeof ProspectTalk>;
export type ProspectFamilyKid = z.infer<typeof ProspectFamilyKid>;
export type ProspectFamilyPet = z.infer<typeof ProspectFamilyPet>;
export type ProspectGiftIdea = z.infer<typeof ProspectGiftIdea>;
export type ProspectAffinities = z.infer<typeof ProspectAffinities>;
export type ResearchJob = z.infer<typeof ResearchJob>;
export type ResearchStartRequest = z.infer<typeof ResearchStartRequest>;
export type ResearchStartResponse = z.infer<typeof ResearchStartResponse>;
export type ResearchJobResponse = z.infer<typeof ResearchJobResponse>;
export type ResearchJobListResponse = z.infer<typeof ResearchJobListResponse>;
export type ResearchJobResult = z.infer<typeof ResearchJobResult>;
export type GiftDraft = z.infer<typeof GiftDraft>;
export type GiftDraftListResponse = z.infer<typeof GiftDraftListResponse>;
export type GiftDraftRequest = z.infer<typeof GiftDraftRequest>;
