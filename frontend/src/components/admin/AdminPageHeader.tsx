import React from 'react';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Console adapter over the shared `PageHeader`. The console is always dark, so
 * it reads from the same semantic tokens as the rest of the product.
 */
export const AdminPageHeader: React.FC<{
  title: React.ReactNode;
  meta?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  headingId?: string;
  headingTabIndex?: number;
  className?: string;
}> = ({ title, meta, description, actions, headingId, headingTabIndex, className }) => (
  <PageHeader
    realm="admin"
    size="sm"
    title={title}
    meta={meta}
    description={description}
    actions={actions}
    id={headingId}
    headingTabIndex={headingTabIndex}
    className={className}
  />
);
