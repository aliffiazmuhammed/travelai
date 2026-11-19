import React, { useState } from 'react';
import Navbar from '@/components/Navbar';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { Button } from '@/components/ui/button';
import {
  Field,
  FormErrorSummary,
} from '@/components/ui/field';
import { FilterBar } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PageSection } from '@/components/ui/page-section';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn } from '@/lib/utils';

type Segment = 'all' | 'open' | 'closed';

const PreviewShell: React.FC<{
  realm: 'agency' | 'admin';
  title: string;
  dark: boolean;
  children: React.ReactNode;
}> = ({ realm, title, dark, children }) => (
  <div
    data-theme={realm}
    className={cn(
      'space-y-6 rounded-3xl border border-border p-5 sm:p-6',
      dark && 'dark',
      realm === 'agency' ? 'bg-agency-canvas text-agency-ink' : 'bg-background text-foreground'
    )}
  >
    <p className="text-overline font-semibold text-muted-foreground">{title}</p>
    {children}
  </div>
);

const DesignSystem: React.FC = () => {
  const [darkPreview, setDarkPreview] = useState(false);
  const [segment, setSegment] = useState<Segment>('all');
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="container mx-auto max-w-6xl px-4 pb-20 pt-24">
        <PageHeader
          realm="public"
          size="lg"
          eyebrow="Design system"
          title="The primitives, side by side"
          description="Headers, filter bars, segments, fields and paging are reviewed here in every realm before they reach a page."
          actions={
            <Button
              type="button"
              variant="outline"
              aria-pressed={darkPreview}
              onClick={() => setDarkPreview((value) => !value)}
            >
              {darkPreview ? 'Preview light' : 'Preview dark'}
            </Button>
          }
        />

        <div className="mt-8 space-y-10">
          <PageSection
            title="PageHeader"
            description="One title ladder: sm 24px, md 30px, lg 30–36px, xl 36–48px. The realm only changes ink."
          >
            <PageHeader
              realm="traveller"
              size="sm"
              eyebrow="Workspace"
              title="Small title"
              description="Used inside the console and dense settings screens."
            />
            <PageHeader
              realm="traveller"
              size="lg"
              title="Traveller page title"
              description="The default for traveller and public pages, matching the plans, proposals and profile screens."
              actions={<Button size="sm">Primary action</Button>}
            />
          </PageSection>

          <PageSection
            title="Realm accents"
            description="The same header, segmented control and buttons in each realm."
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <PreviewShell realm="agency" title="Agency" dark={darkPreview}>
                <PageHeader
                  realm="agency"
                  size="md"
                  title="Client trips"
                  description="Every client trip lives here."
                  actions={<Button size="sm">New trip</Button>}
                />
                <SegmentedControl<Segment>
                  ariaLabel="Agency filter example"
                  realm="agency"
                  value={segment}
                  onChange={setSegment}
                  options={[
                    { value: 'all', label: 'All', count: 12 },
                    { value: 'open', label: 'Open' },
                    { value: 'closed', label: 'Closed' },
                  ]}
                />
              </PreviewShell>
              <PreviewShell realm="admin" title="Admin" dark>
                <PageHeader
                  realm="admin"
                  size="sm"
                  title="Accounts"
                  description="Every traveller, agency owner and admin on the platform."
                  actions={<Button size="sm">Invite</Button>}
                />
                <SegmentedControl<Segment>
                  ariaLabel="Admin filter example"
                  realm="admin"
                  value={segment}
                  onChange={setSegment}
                  options={[
                    { value: 'all', label: 'All', count: 12 },
                    { value: 'open', label: 'Open' },
                    { value: 'closed', label: 'Closed' },
                  ]}
                />
              </PreviewShell>
            </div>
          </PageSection>

          <PageSection
            title="SegmentedControl"
            description="One selected treatment and one height per density; touch pointers get a 44px target."
          >
            <div className="flex flex-wrap items-center gap-4">
              <SegmentedControl<Segment>
                ariaLabel="Small segments"
                size="sm"
                value={segment}
                onChange={setSegment}
                options={[
                  { value: 'all', label: 'All', count: 4 },
                  { value: 'open', label: 'Open' },
                  { value: 'closed', label: 'Closed' },
                ]}
              />
              <SegmentedControl<Segment>
                ariaLabel="Medium segments"
                size="md"
                value={segment}
                onChange={setSegment}
                options={[
                  { value: 'all', label: 'All', count: 4 },
                  { value: 'open', label: 'Open' },
                  { value: 'closed', label: 'Closed' },
                ]}
              />
            </div>
          </PageSection>

          <PageSection
            title="FilterBar"
            description="Search, segments and reset share one row and one wrap."
          >
            <FilterBar
              label="Design sample filters"
              actions={
                <Button type="button" variant="ghost" size="sm">
                  Clear all
                </Button>
              }
            >
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Search by name"
                aria-label="Search by name"
                className="w-full sm:w-56"
              />
              <SegmentedControl<Segment>
                ariaLabel="Design sample segments"
                value={segment}
                onChange={setSegment}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'open', label: 'Open' },
                  { value: 'closed', label: 'Closed' },
                ]}
              />
            </FilterBar>
          </PageSection>

          <PageSection
            title="Field"
            description="Label, hint, required marker and error slot share one id set. Submit focuses the first invalid control."
          >
            <div className="grid gap-6 md:grid-cols-2">
              <Field
                label="Email"
                hint="We only use this to sign you in."
                required
              >
                {(control) => (
                  <Input
                    {...control}
                    type="email"
                    name="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Destination"
                error={fieldError}
                hint="City or region."
                required
              >
                {(control) => (
                  <Input
                    {...control}
                    name="destination"
                    value=""
                    onChange={() => setFieldError('Choose a destination before continuing.')}
                    placeholder="Where to?"
                  />
                )}
              </Field>
            </div>
            <FormErrorSummary errors={{ email: fieldError }} />
          </PageSection>

          <PageSection title="Buttons" description="Fine-pointer density in 36–40px; coarse pointers expand to 44px.">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button size="sm">Small</Button>
              <Button size="icon" aria-label="Icon action">
                <span aria-hidden="true">+</span>
              </Button>
            </div>
          </PageSection>

          <PageSection title="Pagination" description="Paging keeps the live count and moves focus to the table heading.">
            <div className="rounded-2xl border border-border">
              <AdminPagination
                page={2}
                totalPages={4}
                total={37}
                noun="account"
                onChange={() => undefined}
              />
            </div>
          </PageSection>

        </div>
      </main>
    </div>
  );
};

export default DesignSystem;
