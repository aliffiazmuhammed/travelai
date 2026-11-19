import LegalDocument from "@/components/legal/LegalDocument";
import { LEGAL_VERSIONS, TERMS_SECTIONS } from "@/content/legal";

/** Public Terms of Service (Phase 1B). */
const Terms = () => (
  <LegalDocument
    documentTitle="Terms of Service"
    title="Terms of Service"
    description="The rules for using waytowalk: your account, trips, agencies, the assistant, and what happens if something goes wrong."
    version={LEGAL_VERSIONS.terms}
    sections={TERMS_SECTIONS}
    companion={{ label: "Privacy Policy", to: "/privacy" }}
  />
);

export default Terms;
