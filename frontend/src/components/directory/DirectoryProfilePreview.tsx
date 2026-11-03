import React from 'react';
import { BadgeCheck, Clock, Globe, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AgencyLogoTile } from '@/components/directory/AgencyLogoTile';
import { cn } from '@/lib/utils';

/**
 * The public directory profile as travellers see it (M9 D2/D3).
 *
 * Presentational only: no fetching, no session. The settings editor feeds it
 * the live draft; the public page (D3) feeds it the public projection, so the
 * preview and the real page can never drift apart. Hero and facts are exported
 * separately because the public page splits them across a marketplace layout
 * while the editor keeps them stacked in one preview card.
 */
export interface DirectoryProfilePreviewModel {
  name: string;
  about: string;
  baseCity: string;
  destinations: string[];
  specialties: string[];
  services: { id: string; label: string }[];
  languages: { code: string; label: string }[];
  /** Already resolved for rendering: private assets become object URLs. */
  logoUrl?: string | null;
  website?: string | null;
  contactPhone?: string | null;
  gstin?: string | null;
  verified?: boolean;
  /** Median reply hours; the line is hidden when null (M9 D7). */
  replyTimeHours?: number | null;
}

export const DirectoryProfileHero: React.FC<{
  profile: DirectoryProfilePreviewModel;
  className?: string;
  ariaLabel?: string;
  /** The live page owns the document's only h1. */
  headingAs?: 'h1' | 'h2';
  /** The live page passes the enquiry and report actions; the editor passes none. */
  actions?: React.ReactNode;
}> = ({
  profile,
  className,
  ariaLabel,
  headingAs: Heading = 'h2',
  actions,
}) => {
  const name = profile.name.trim() || 'Your agency';
  const languageNames = profile.languages.map((entry) => entry.label);

  return (
    <header
      aria-label={ariaLabel}
      className={cn(
        'relative overflow-hidden rounded-[2rem] border border-teal-100/80 bg-gradient-to-br from-teal-50 via-white to-amber-50 shadow-sm dark:border-teal-900/40 dark:from-teal-950/50 dark:via-slate-900 dark:to-amber-950/20',
        className
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-teal-200/50 blur-3xl dark:bg-teal-800/20" />
        <div className="absolute -bottom-28 right-24 h-56 w-56 rounded-full bg-amber-200/50 blur-3xl dark:bg-amber-800/10" />
      </div>

      <div className="relative px-6 py-7 sm:px-9 sm:py-9">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          <AgencyLogoTile
            name={name}
            logoUrl={profile.logoUrl}
            className="h-16 w-16 rounded-3xl border-white/80 text-2xl shadow-sm sm:h-20 sm:w-20 dark:border-slate-700"
            imgClassName="p-1.5"
          />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Heading className="font-display text-2xl font-black leading-tight tracking-tight text-slate-900 sm:text-4xl dark:text-white">
                {name}
              </Heading>
              {profile.verified ? (
                <Badge className="gap-1 rounded-full bg-teal-600 px-2.5 py-0.5 text-[10px] font-bold text-white hover:bg-teal-600">
                  <ShieldCheck className="h-3 w-3" />
                  Verified
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-slate-600 sm:text-sm dark:text-slate-300">
              {profile.baseCity.trim() ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                  Based in {profile.baseCity.trim()}
                </span>
              ) : (
                <span className="italic text-slate-400">
                  Your base city will appear here.
                </span>
              )}
              {profile.replyTimeHours && profile.replyTimeHours > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                  Usually replies in ~{profile.replyTimeHours} h
                </span>
              ) : null}
              {languageNames.length > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                  Speaks {languageNames.join(', ')}
                </span>
              ) : null}
            </div>

            {profile.about.trim() ? (
              <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-700 sm:text-[15px] dark:text-slate-300">
                {profile.about.trim()}
              </p>
            ) : (
              <p className="text-sm italic text-slate-400">
                Tell travellers who you are and how you plan trips.
              </p>
            )}

            {actions ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
};

export const DirectoryProfileFacts: React.FC<{
  profile: DirectoryProfilePreviewModel;
  className?: string;
  /** Hints are for the editor draft; a public page shows only what exists. */
  showEmptyHints?: boolean;
}> = ({ profile, className, showEmptyHints = true }) => {
  const hasContact = Boolean(profile.website || profile.contactPhone || profile.gstin);

  return (
    <div className={cn('space-y-6', className)}>
      <section aria-label="Services">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Services
        </h3>
        {profile.services.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {profile.services.map((service) => (
              <Badge
                key={service.id}
                variant="secondary"
                className="rounded-full bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200"
              >
                {service.label}
              </Badge>
            ))}
          </div>
        ) : showEmptyHints ? (
          <p className="mt-1.5 text-xs italic text-muted-foreground/70">
            Choose the services you offer.
          </p>
        ) : null}
      </section>

      <section aria-label="Destinations">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Destinations
        </h3>
        {profile.destinations.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {profile.destinations.map((destination) => (
              <Badge key={destination} variant="outline" className="rounded-full">
                {destination}
              </Badge>
            ))}
          </div>
        ) : showEmptyHints ? (
          <p className="mt-1.5 text-xs italic text-muted-foreground/70">
            Add the places you plan trips to.
          </p>
        ) : null}
      </section>

      {profile.specialties.length > 0 ? (
        <section aria-label="Specialties">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Known for
          </h3>
          <ul className="mt-2 space-y-1.5">
            {profile.specialties.map((specialty) => (
              <li
                key={specialty}
                className="flex items-start gap-2 text-sm text-foreground/85"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500"
                />
                {specialty}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasContact ? (
        <section aria-label="Contact">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Contact
          </h3>
          <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
            {profile.website ? (
              <li className="flex items-start gap-2">
                <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                <span className="break-all">{profile.website}</span>
              </li>
            ) : null}
            {profile.contactPhone ? (
              <li className="flex items-start gap-2">
                <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                <span>{profile.contactPhone}</span>
              </li>
            ) : null}
            {profile.gstin ? (
              <li className="font-mono text-[11px]">GSTIN {profile.gstin}</li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
};

const DirectoryProfilePreview: React.FC<{
  profile: DirectoryProfilePreviewModel;
  className?: string;
  /** The editor preview and the live page announce themselves differently. */
  ariaLabel?: string;
  /** The live page owns the document's only h1. */
  headingAs?: 'h1' | 'h2';
}> = ({
  profile,
  className,
  ariaLabel = 'Public profile preview',
  headingAs = 'h2',
}) => (
  <article className={cn('space-y-4', className)} aria-label={ariaLabel}>
    <DirectoryProfileHero profile={profile} headingAs={headingAs} />
    <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
      <DirectoryProfileFacts profile={profile} />
    </div>
  </article>
);

export default DirectoryProfilePreview;
