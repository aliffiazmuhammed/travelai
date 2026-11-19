import React from 'react';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Agency adapter over the shared `PageHeader`. The workspace keeps its serif
 * title and panel ink; the structure comes from the one header primitive.
 */
export const AgencyPageHeader: React.FC<{
  title: string;
  meta?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  headingId?: string;
  headingTabIndex?: number;
  className?: string;
}> = ({ title, meta, description, actions, headingId, headingTabIndex, className }) => (
  <PageHeader
    realm="agency"
    size="md"
    title={title}
    meta={meta}
    description={description}
    actions={actions}
    id={headingId}
    headingTabIndex={headingTabIndex}
    className={className}
  />
);
