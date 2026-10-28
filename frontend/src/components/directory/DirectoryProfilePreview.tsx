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
 * preview and the real page can never drift apart.
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
  headingAs: Heading = 'h2',
}) => {
  const name = profile.name.trim() || 'Your agency';
  const languageNames = profile.languages.map((entry) => entry.label);

  return (
    <article
      className={cn(
        'overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
        className
      )}
      aria-label={ariaLabel}
    >
      <div className="border-b border-slate-100 bg-gradient-to-br from-teal-50 via-white to-amber-50 px-5 py-6 dark:border-slate-800 dark:from-teal-950/40 dark:via-slate-900 dark:to-amber-950/20">
        <div className="flex items-start gap-4">
          <AgencyLogoTile
            name={name}
            logoUrl={profile.logoUrl}
            className="h-16 w-16 border-white/70 text-xl dark:border-slate-700"
            imgClassName="p-1"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Heading className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                {name}
              </Heading>
              {profile.verified ? (
                <Badge className="gap-1 bg-teal-600 text-[10px] text-white hover:bg-teal-600">
                  <ShieldCheck className="h-3 w-3" />
                  Verified
                </Badge>
              ) : null}
            </div>
            {profile.baseCity.trim() ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                <MapPin className="h-3.5 w-3.5 text-teal-600" />
                Based in {profile.baseCity.trim()}
              </p>
            ) : (
              <p className="mt-1 text-sm italic text-slate-400">
                Your base city will appear here.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        {profile.about.trim() ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {profile.about.trim()}
          </p>
        ) : (
          <p className="text-sm italic text-slate-400">
            Tell travellers who you are and how you plan trips.
          </p>
        )}

        <section aria-label="Services">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Services
          </h3>
          {profile.services.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.services.map((service) => (
                <Badge
                  key={service.id}
                  variant="secondary"
                  className="bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200"
                >
                  {service.label}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs italic text-slate-400">
              Choose the services you offer.
            </p>
          )}
        </section>

        <section aria-label="Destinations">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Destinations
          </h3>
          {profile.destinations.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.destinations.map((destination) => (
                <Badge key={destination} variant="outline">
                  {destination}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs italic text-slate-400">
              Add the places you plan trips to.
            </p>
          )}
        </section>

        {profile.specialties.length > 0 ? (
          <section aria-label="Specialties">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Known for
            </h3>
            <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">
              {profile.specialties.join(' · ')}
            </p>
          </section>
        ) : null}

        {languageNames.length > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <BadgeCheck className="h-3.5 w-3.5 text-teal-600" />
            Speaks {languageNames.join(', ')}
          </p>
        ) : null}

        {profile.replyTimeHours && profile.replyTimeHours > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5 text-teal-600" />
            Usually replies in ~{profile.replyTimeHours} h
          </p>
        ) : null}

        {profile.website || profile.contactPhone || profile.gstin ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-100 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
            {profile.website ? (
              <span className="inline-flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                {profile.website}
              </span>
            ) : null}
            {profile.contactPhone ? (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {profile.contactPhone}
              </span>
            ) : null}
            {profile.gstin ? (
              <span className="font-mono text-[11px]">GSTIN {profile.gstin}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
};

export default DirectoryProfilePreview;
