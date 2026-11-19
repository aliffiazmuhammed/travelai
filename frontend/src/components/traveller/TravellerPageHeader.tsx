import React from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { TravellerBreadcrumbs, type TravellerCrumb } from './TravellerBreadcrumbs';

interface TravellerPageHeaderProps {
  title: React.ReactNode;
  /** Quiet line above the title: "Your conversations", "Trips people shared". */
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Badges or tallies that belong beside the title. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ElementType;
  crumbs?: TravellerCrumb[];
  /** Search and filters that belong inside the hero card on discovery pages. */
  children?: React.ReactNode;
  /**
   * `plain` is the calm workspace surface. `hero` keeps the expressive
   * translucent card the discovery pages use.
   */
  tone?: 'plain' | 'hero';
  headingId?: string;
  headingTabIndex?: number;
  className?: string;
}

/**
 * Traveller adapter over the shared `PageHeader`: same trail, title ladder and
 * spacing as every other page, with the traveller ink and accent.
 */
export const TravellerPageHeader: React.FC<TravellerPageHeaderProps> = ({
  title,
  eyebrow,
  description,
  meta,
  actions,
  icon,
  crumbs,
  children,
  tone = 'plain',
  headingId,
  headingTabIndex,
  className,
}) => (
  <PageHeader
    realm="traveller"
    size="lg"
    title={title}
    eyebrow={eyebrow}
    description={description}
    meta={meta}
    actions={actions}
    icon={icon}
    breadcrumbs={crumbs?.length ? <TravellerBreadcrumbs items={crumbs} /> : undefined}
    tone={tone}
    id={headingId}
    headingTabIndex={headingTabIndex}
    className={className}
  >
    {children}
  </PageHeader>
);
