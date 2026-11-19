import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown } from "lucide-react";

import Navbar from "@/components/Navbar";
import { LEGAL_LAST_UPDATED, type LegalSection } from "@/content/legal";
import { applyPageMeta } from "@/lib/meta";

interface LegalDocumentProps {
  /** Page title in the browser tab and the Open Graph title. */
  documentTitle: string;
  title: string;
  description: string;
  version: string;
  sections: LegalSection[];
  /** The other policy, linked from the footer of the page. */
  companion: { label: string; to: string };
}

/**
 * Shared shell for the public Terms and Privacy pages (Phase 1B).
 *
 * These pages are intentionally plain and static: they are read, printed, and
 * linked from sign-up. The section ids double as stable anchors so a support
 * reply can point at one clause. The table of contents is generated from the
 * same sections: a sticky rail on desktop, a collapsible list on mobile.
 */
const LegalDocument = ({
  documentTitle,
  title,
  description,
  version,
  sections,
  companion,
}: LegalDocumentProps) => {
  useEffect(() => {
    applyPageMeta({
      title: `${documentTitle} · waytowalk`,
      description,
      ogType: "website",
    });
  }, [description, documentTitle]);

  const tocLinks = sections.map((section) => (
    <li key={section.id}>
      <a
        href={`#${section.id}`}
        className="block rounded-lg px-2.5 py-1.5 text-xs leading-5 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {section.title}
      </a>
    </li>
  ));

  return (
    <div className="flex min-h-screen flex-col bg-gradient-hero">
      <Navbar />

      <main className="flex-1 pb-20 pt-24">
        <div className="container mx-auto max-w-5xl px-4">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to waytowalk
          </Link>

          <header className="mt-6 max-w-2xl">
            <p className="text-overline font-semibold text-primary">
              Legal
            </p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {description}
            </p>
            <p className="mt-4 text-xs font-medium text-muted-foreground">
              Last updated {LEGAL_LAST_UPDATED} · Version {version}
            </p>
          </header>

          {/* Mobile: one collapsible list that does not push the document down. */}
          <details className="group mt-8 rounded-2xl border border-border/60 bg-card px-4 py-3 lg:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-foreground marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronDown
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
              On this page
              <span className="ml-auto text-muted-foreground">
                {sections.length} sections
              </span>
            </summary>
            <ol className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
              {tocLinks}
            </ol>
          </details>

          <div className="mt-10 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-10">
            <nav
              aria-label="On this page"
              className="hidden lg:sticky lg:top-24 lg:block"
            >
              <p className="px-2.5 text-overline font-semibold text-muted-foreground">
                On this page
              </p>
              <ol className="mt-2 space-y-0.5 border-l border-border/70 pl-1">
                {tocLinks}
              </ol>
            </nav>

            <div className="min-w-0 space-y-4">
              {sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  aria-labelledby={`${section.id}-heading`}
                  className="scroll-mt-28 rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-8"
                >
                  <h2
                    id={`${section.id}-heading`}
                    className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                  >
                    {section.title}
                  </h2>
                  <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {section.bullets ? (
                      <ul className="space-y-2">
                        {section.bullets.map((item) => (
                          <li key={item} className="flex items-start gap-2.5">
                            <span
                              aria-hidden="true"
                              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                            />
                            <span className="min-w-0">{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </section>
              ))}

              <div className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <p>Read the other policy as well.</p>
                <Link
                  to={companion.to}
                  className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {companion.label}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LegalDocument;
