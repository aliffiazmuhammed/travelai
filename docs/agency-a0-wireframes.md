# Agency Workspace A0 wireframes

These are structural wireframes, not final visual design. They pin the
information architecture before A1 builds the agency shell.

## 1. `/agency` dashboard

```text
+--------------------------------------------------------------------------------+
| TravelAI Agency        Acme Travel [switcher]              Owner menu  Settings |
+--------------------------------------------------------------------------------+
| Overview | Trips | Clients | Templates | Team                                  |
+--------------------------------------------------------------------------------+
| Good morning, Priya                                                            |
|                                                                                |
| [ Active trips ]  [ Quotes expiring ]  [ Exports this month ]  [ Team seats ]  |
|       12                  3                    18 / 50               4 / 6      |
|                                                                                |
| Recent trips                                              [ + New trip ]       |
| +----------------------------------------------------------------------------+ |
| | Bali Family Escape      4 days   Quote: sent      Assigned: Priya   [Open] | |
| | Japan Cherry Blossom   10 days   Quote: draft     Assigned: Arjun   [Open] | |
| +----------------------------------------------------------------------------+ |
|                                                                                |
| Expiring quotes                                                                |
| +----------------------------------------------------------------------------+ |
| | QT-1042  Goa long weekend   expires in 2 days   Rs 84,000   [View quote]  | |
| +----------------------------------------------------------------------------+ |
|                                                                                |
| Recent exports                                                                 |
| | Bali Family Escape  v3  client template  ready  2 min ago  [Download]      | |
+--------------------------------------------------------------------------------+
```

Empty state:

```text
+----------------------------------------------+
| No trips yet                                 |
| Create your first agency itinerary and       |
| proposal.                                    |
| [ Create trip ]                              |
+----------------------------------------------+
```

## 2. `/agency/trips`

```text
+--------------------------------------------------------------------------------+
| Trips                                                          [ + New trip ]   |
| [ Search destination or client ]  Status: All  Assigned: All  Sort: Updated    |
+--------------------------------------------------------------------------------+
| Destination / title        Dates        Client          Quote      Assigned      |
|--------------------------------------------------------------------------------|
| Bali Family Escape         12-16 Nov    Sharma family   Sent       Priya    Open |
| Japan Cherry Blossom       02-12 Apr    Mehta group     Draft      Arjun    Open |
| Kerala Backwaters          20-24 Dec    Iyer family     Accepted   Priya    Open |
+--------------------------------------------------------------------------------+
```

The list must never include a personal trip. Personal `/dashboard` must never
include an agency trip.

## 3. `/agency/trips/:id` shell

```text
+--------------------------------------------------------------------------------+
| <- Trips   Bali Family Escape        Client: Sharma family     Quote: Sent      |
| 12-16 Nov 2026  4 days  Bali, Indonesia             [ Share ] [ Export proposal ]|
+--------------------------------------------------------------------------------+
| Itinerary | Budget | Expenses | Map | History | People | Chat | Quote           |
+--------------------------------------------------------------------------------+
| Itinerary content reuses the existing planner/editor components.               |
| Agency-only additions live in the header, Quote tab and Export flow.           |
+--------------------------------------------------------------------------------+
```

Rules:

- Existing trip tabs keep their current behavior and rank checks.
- The agency shell adds client, quote, assignment and export actions.
- Viewers see the trip but no edit controls.
- The individual dashboard is untouched.

## 4. Export proposal flow

Step 1: choose template

```text
+--------------------------------------------------------------+
| Export proposal: Bali Family Escape                    [x]   |
+--------------------------------------------------------------+
| Client template                                              |
| (o) Acme Signature Brochure          [Preview]                |
| ( ) Minimal Editorial                [Preview]                |
| ( ) Internal costing sheet (not client-facing)               |
|                                                              |
| Quote version: v3 (sent)                                      |
| Output: A4 PDF                                               |
|                                                              |
|                              [ Cancel ]  [ Continue ]        |
+--------------------------------------------------------------+
```

Step 2: preview and confirm

```text
+--------------------------------------------------------------+
| Preview: Acme Signature Brochure                             |
+--------------------------------------------------------------+
| [ page 1 cover ] [ page 2 recommendations ] [ page 3 day 1 ] |
|                                                              |
| 11 pages  |  Client-safe  |  No internal cost                |
|                                                              |
| [ Back ]                                      [ Generate PDF ]|
+--------------------------------------------------------------+
```

Step 3: generated

```text
+--------------------------------------------------------------+
| Proposal ready                                               |
|                                                              |
| Acme_Signature_Bali_Family_Escape.pdf                        |
| Link expires in 7 days                                       |
|                                                              |
| [ Download PDF ]  [ Copy client link ]  [ View export history ]|
+--------------------------------------------------------------+
```

Failure state:

```text
+--------------------------------------------------------------+
| Could not generate the proposal                              |
| The template or an image failed validation. Nothing was       |
| published. You can retry safely.                             |
| [ Retry ]  [ Back to template ]                              |
+--------------------------------------------------------------+
```

## 5. Template gallery

```text
+--------------------------------------------------------------------------------+
| Templates                                                       [ Request custom ]|
+--------------------------------------------------------------------------------+
| +------------------+  +------------------+  +------------------+               |
| | Acme Signature   |  | Minimal Editorial|  | Internal Costing |               |
| | Client  v3       |  | Client  v1       |  | Internal  v1     |               |
| | [active] [default]| | [active]         |  | [active]         |               |
| | [Preview] [Edit] |  | [Preview] [Edit] |  | [Preview] [Edit] |               |
| +------------------+  +------------------+  +------------------+               |
|                                                                                |
| Managed onboarding: send us your source design, fonts, logo, mascot and         |
| photos. We build and validate the template before it becomes selectable.       |
+--------------------------------------------------------------------------------+
```

## 6. Brand settings

```text
+--------------------------------------------------------------------------------+
| Brand                                                                           |
+--------------------------------------------------------------------------------+
| Agency name       [ Acme Travel                            ]                     |
| Logo              [ upload ]  preview: [logo]                                    |
| Mascot            [ upload ]  preview: [mascot]                                  |
| Primary color     [ #0F766E ]                                                    |
| Accent color      [ #F59E0B ]                                                    |
| Heading font      [ Poppins        v ]  license note: [ licensed for PDF ]       |
| Body font         [ Poppins        v ]                                           |
| Contact phone     [ +91 ... ]                                                    |
| Contact email     [ hello@... ]                                                  |
| Website           [ https://... ]                                                |
| Address           [ ... ]                                                        |
| GSTIN             [ ... ]                                                        |
|                                                                                |
| [ Save changes ]                                                                |
+--------------------------------------------------------------------------------+
```

## 7. Client proposal view

```text
+--------------------------------------------------------------------------------+
| [Acme Travel logo]                                            Call  |  Email      |
+--------------------------------------------------------------------------------+
| Bali Family Escape                                                              |
| 12-16 Nov 2026  |  4 days  |  2 adults, 2 children                             |
+--------------------------------------------------------------------------------+
| [cover photo]                                                                    |
|                                                                                |
| Your itinerary                                                                   |
| Day 1 ...                                                                        |
| Day 2 ...                                                                        |
|                                                                                |
| Inclusions / Exclusions / Things to carry / Cancellation policy                  |
|                                                                                |
| Total: Rs 84,000  (Rs 21,000 per person)          Valid until 30 Oct 2026        |
| [ Accept proposal ]                                                              |
+--------------------------------------------------------------------------------+
```

Client view rules:

- Use the client-safe projection only.
- Never show internal cost, markup, expenses or internal notes.
- Never render an internal template.
- Revoked or expired links return 404.

## 8. Disabled / dark state

When `AGENCY_WORKSPACE_ENABLED` is false:

- `/api/agency/*` answers 404.
- No agency navigation is shown.
- `/agency` is not linked from the individual app.
- `/api/health` reports `agency.enabled: false`.

When the flag is true but A1 has not shipped:

- `GET /api/agency/status` is available for operations.
- `writesEnabled` remains false.
- No trip can be created through the agency namespace.
