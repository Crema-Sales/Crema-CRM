import { ContactDetailModal } from "@/components/contact-detail-modal";
import { CompanyDetailModal } from "@/components/company-detail-modal";
import { DealDetailModal } from "@/components/deal-detail-modal";
import { usePeek } from "./peek-context";

// Mounted once in the authenticated layout. Renders whichever peek panel
// matches the current target so any cross-link, anywhere, can open a panel
// by calling usePeek().peek(kind, id) — no per-page modal state plumbing.
export function PeekHost() {
  const { target, closePeek } = usePeek();
  const onOpenChange = (open: boolean) => {
    if (!open) closePeek();
  };

  return (
    <>
      <ContactDetailModal
        contactId={target?.kind === "contact" ? target.id : null}
        open={target?.kind === "contact"}
        onOpenChange={onOpenChange}
      />
      <CompanyDetailModal
        companyId={target?.kind === "company" ? target.id : null}
        open={target?.kind === "company"}
        onOpenChange={onOpenChange}
      />
      <DealDetailModal
        dealId={target?.kind === "deal" ? target.id : null}
        open={target?.kind === "deal"}
        onOpenChange={onOpenChange}
      />
    </>
  );
}
