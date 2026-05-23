import { createFileRoute } from "@tanstack/react-router";
import { getDB } from "@/db/env.server";
import { getOrganizationByGuid } from "@/lib/orgs.server";

// Standard 43-byte transparent 1x1 GIF89a. Inlined as a literal so we never
// need to fetch or read from disk at request time.
const TRANSPARENT_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
  0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

const GIF_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Content-Length": "43",
  "Access-Control-Allow-Origin": "*",
};

function uuid() {
  return crypto.randomUUID();
}

async function findContactByEmail(orgId: string, email: string): Promise<string | null> {
  const row = await getDB()
    .prepare("SELECT id FROM contacts WHERE org_id = ? AND email = ? LIMIT 1")
    .bind(orgId, email)
    .first<{ id: string }>();
  return row?.id ?? null;
}

// GET /api/public/pixel?email=foo@example.com&campaign=tutorial[&guid=cremasales]
//
// Email-open tracking pixel. Returns a 1x1 transparent GIF synchronously and,
// if both `email` and a known `guid` resolve to a contact, inserts an
// `activity` row of type `email` so the timeline picks up the open on its
// next refresh. Failures are silent — pixels in flight should never break the
// recipient's email client.
export const Route = createFileRoute("/api/public/pixel")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const email = url.searchParams.get("email")?.toLowerCase().trim() ?? null;
        const campaign = url.searchParams.get("campaign")?.trim() || null;
        const guid = url.searchParams.get("guid")?.trim() || "cremasales";

        // Always respond with the GIF; even if logging fails we don't want a
        // broken image in someone's inbox.
        const response = new Response(TRANSPARENT_GIF, { status: 200, headers: GIF_HEADERS });

        if (!email) return response;
        try {
          const org = await getOrganizationByGuid(guid);
          if (!org) return response;
          const contactId = await findContactByEmail(org.id, email);
          if (!contactId) return response;
          const subject = campaign ? `Email opened: ${campaign}` : "Email opened";
          await getDB()
            .prepare(
              `INSERT INTO activities (id, type, subject, body, contact_id, org_id, occurred_at)
               VALUES (?, 'email', ?, NULL, ?, ?, datetime('now'))`,
            )
            .bind(uuid(), subject, contactId, org.id)
            .run();
        } catch {
          // swallow — pixel must stay benign
        }
        return response;
      },
    },
  },
});
