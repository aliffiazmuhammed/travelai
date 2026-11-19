import LegalDocument from "@/components/legal/LegalDocument";
import { LEGAL_VERSIONS, PRIVACY_SECTIONS } from "@/content/legal";

/** Public Privacy Policy (Phase 1B). */
const Privacy = () => (
  <LegalDocument
    documentTitle="Privacy Policy"
    title="Privacy Policy"
    description="What waytowalk collects, why we need it, how trip chat stays private, and the choices you have."
    version={LEGAL_VERSIONS.privacy}
    sections={PRIVACY_SECTIONS}
    companion={{ label: "Terms of Service", to: "/terms" }}
  />
);

export default Privacy;
