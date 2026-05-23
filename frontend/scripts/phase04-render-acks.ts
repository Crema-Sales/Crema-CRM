// Visual eyeball for the form-submit ack templates. Writes HTML samples to
// docs/playbooks/resend-email/Working/ so they can be opened in a browser.
// Outside tsconfig scope — doesn't bleed into the worker build.
//
//   bunx tsx scripts/phase04-render-acks.ts

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mailingListAck } from "../src/lib/email/templates/mailing-list";
import { demoRequestAck } from "../src/lib/email/templates/demo-request";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../../docs/playbooks/resend-email/Working");
mkdirSync(outDir, { recursive: true });

const samples = [
  {
    name: "phase04-mailing-list-named.html",
    email: mailingListAck({
      fullName: "Pedram",
      unsubscribeUrl: "https://cremasales.com/unsubscribe/pending?c=marketing",
    }),
  },
  {
    name: "phase04-mailing-list-anon.html",
    email: mailingListAck({
      fullName: null,
      unsubscribeUrl: "https://cremasales.com/unsubscribe/pending?c=marketing",
    }),
  },
  {
    name: "phase04-demo-request-named.html",
    email: demoRequestAck({
      fullName: "Pedram",
      company: "Acme Coffee Roasters",
      unsubscribeUrl: "https://cremasales.com/unsubscribe/pending?c=marketing",
    }),
  },
  {
    name: "phase04-demo-request-anon.html",
    email: demoRequestAck({
      fullName: null,
      company: null,
      unsubscribeUrl: "https://cremasales.com/unsubscribe/pending?c=marketing",
    }),
  },
];

for (const s of samples) {
  writeFileSync(resolve(outDir, s.name), s.email.html);
  console.log(`wrote ${s.name} (${s.email.html.length} bytes)`);
  console.log(`  subject: ${s.email.subject}`);
}
