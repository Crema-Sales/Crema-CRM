// Phase 02 visual eyeball: render both templates to HTML files in the
// playbook Working/ folder so we can open them in a browser and verify the
// layout before doing any real Resend smoke. DELETE this script at the end
// of Phase 02 — it has no production purpose.
//
//   bunx tsx scripts/phase02-render.ts

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verificationEmail } from "../src/lib/email/templates/verification";
import { ackEmail } from "../src/lib/email/templates/ack";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../../docs/playbooks/resend-email/Working");
mkdirSync(outDir, { recursive: true });

const samples = [
  {
    name: "phase02-verification-initial.html",
    email: verificationEmail({
      fullName: "Pedram",
      verifyUrl: "http://localhost:5173/verify-email/abc-123-token?email=user@example.com",
      kind: "initial",
    }),
  },
  {
    name: "phase02-verification-change.html",
    email: verificationEmail({
      fullName: "Pedram",
      verifyUrl: "http://localhost:5173/verify-email/xyz-789-token?email=user%2Bnew@example.com",
      kind: "change",
    }),
  },
  {
    name: "phase02-ack-crema.html",
    email: ackEmail({
      fullName: "Pedram",
      orgName: "Crema",
      unsubscribeUrl: "http://localhost:5173/unsubscribe/unsub-token-here?c=ack",
    }),
  },
  {
    name: "phase02-ack-anon.html",
    email: ackEmail({
      fullName: null,
      orgName: "Acme Coffee Roasters",
      unsubscribeUrl: "http://localhost:5173/unsubscribe/another-token?c=ack",
    }),
  },
];

for (const s of samples) {
  writeFileSync(resolve(outDir, s.name), s.email.html);
  console.log(`wrote ${s.name} (${s.email.html.length} bytes)`);
  console.log(`  subject: ${s.email.subject}`);
  console.log(`  text length: ${s.email.text.length}`);
}
