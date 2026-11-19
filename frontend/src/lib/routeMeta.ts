import type { PageMeta } from "@/lib/meta";

/**
 * Route-level metadata defaults (C-20).
 *
 * Every route needs a title and description, and private realms must not be
 * indexable. Pages that know more (a shared trip, a proposal, a legal document)
 * call `applyPageMeta` themselves and win because their effect runs after this
 * component's.
 *
 * Keep the order specific → general: the first matching entry wins.
 */

interface RouteMetaRule {
  matches: (pathname: string) => boolean;
  meta: PageMeta;
}

const NOINDEX = "noindex, nofollow";

const exact = (path: string) => (pathname: string) => pathname === path;
const prefix = (base: string) => (pathname: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

const siteDescription =
  "Discover real trips and travel agencies, adapt the route with your group, and keep the plan, map, weather and budget together.";

const RULES: RouteMetaRule[] = [
  {
    matches: prefix("/admin"),
    meta: {
      title: "Platform console · waytowalk",
      description: "The private waytowalk platform console.",
      robots: NOINDEX,
    },
  },
  {
    matches: prefix("/agency"),
    meta: {
      title: "Agency workspace · waytowalk",
      description: "The private waytowalk workspace for travel agencies.",
      robots: NOINDEX,
    },
  },
  {
    matches: exact("/plan"),
    meta: {
      title: "Plan a trip · waytowalk",
      description:
        "Build a trip with the assistant, then adapt the route, stays and budget with your group.",
      robots: NOINDEX,
    },
  },
  {
    matches: exact("/dashboard"),
    meta: {
      title: "My trips · waytowalk",
      description: "Your trips, plans and shared itineraries.",
      robots: NOINDEX,
    },
  },
  {
    matches: exact("/profile"),
    meta: {
      title: "Your profile · waytowalk",
      description: "Your account, travel page and preferences.",
      robots: NOINDEX,
    },
  },
  {
    matches: exact("/enquiries"),
    meta: {
      title: "Your enquiries · waytowalk",
      description: "Conversations and proposals with travel agencies.",
      robots: NOINDEX,
    },
  },
  {
    matches: prefix("/enquiry"),
    meta: {
      title: "Enquiry · waytowalk",
      description: "A private conversation with a travel agency.",
      robots: NOINDEX,
    },
  },
  {
    matches: exact("/proposals"),
    meta: {
      title: "Your proposals · waytowalk",
      description: "Proposals agencies prepared for you.",
      robots: NOINDEX,
    },
  },
  {
    matches: exact("/forgot-password"),
    meta: {
      title: "Reset your password · waytowalk",
      description: "Request a password reset link for your waytowalk account.",
      robots: NOINDEX,
    },
  },
  {
    matches: prefix("/reset-password"),
    meta: {
      title: "Choose a new password · waytowalk",
      description: "Set a new password for your waytowalk account.",
      robots: NOINDEX,
    },
  },
  {
    matches: prefix("/conversation"),
    meta: {
      title: "Your enquiry · waytowalk",
      description: "A private conversation with a travel agency.",
      robots: NOINDEX,
    },
  },
  {
    matches: prefix("/invite"),
    meta: {
      title: "Trip invitation · waytowalk",
      description: "Join a trip shared on waytowalk.",
      robots: NOINDEX,
    },
  },
  {
    matches: prefix("/shared"),
    meta: {
      title: "Shared itinerary · waytowalk",
      description: "A read-only itinerary shared on waytowalk.",
      robots: NOINDEX,
    },
  },
  {
    matches: prefix("/proposal"),
    meta: {
      title: "Travel proposal · waytowalk",
      description: "A travel proposal prepared for you on waytowalk.",
      robots: NOINDEX,
    },
  },
  {
    matches: exact("/auth"),
    meta: {
      title: "Sign in or create an account · waytowalk",
      description:
        "Sign in to plan trips, join a group or manage your agency workspace.",
    },
  },
  {
    matches: exact("/terms"),
    meta: {
      title: "Terms of Service · waytowalk",
      description:
        "The rules for using waytowalk: your account, trips, agencies and the assistant.",
    },
  },
  {
    matches: exact("/privacy"),
    meta: {
      title: "Privacy Policy · waytowalk",
      description:
        "What waytowalk collects, why, and the controls you have over your data.",
    },
  },
  {
    matches: exact("/guidelines"),
    meta: {
      title: "Community guidelines · waytowalk",
      description: "How travellers and agencies keep waytowalk useful and safe.",
    },
  },
  {
    matches: exact("/explore"),
    meta: {
      title: "Explore shared trips · waytowalk",
      description:
        "Browse real itineraries shared by travellers and upcoming agency events.",
    },
  },
  {
    matches: prefix("/explore/events"),
    meta: {
      title: "Agency event · waytowalk",
      description: "An upcoming trip or event from a travel agency on waytowalk.",
    },
  },
  {
    matches: prefix("/explore"),
    meta: {
      title: "Shared trip · waytowalk",
      description: "A real itinerary shared by a traveller on waytowalk.",
    },
  },
  {
    matches: exact("/agencies/apply"),
    meta: {
      title: "Apply to join as an agency · waytowalk",
      description:
        "Apply to bring your travel agency onto waytowalk and publish your trips.",
    },
  },
  {
    matches: exact("/agencies"),
    meta: {
      title: "Travel agencies · waytowalk",
      description: "Browse travel agencies and the trips they run.",
    },
  },
  {
    matches: prefix("/agencies"),
    meta: {
      title: "Travel agency · waytowalk",
      description: "An agency profile, its trips and events on waytowalk.",
    },
  },
  {
    matches: prefix("/travelers"),
    meta: {
      title: "Traveller · waytowalk",
      description: "A traveller's public page and shared trips on waytowalk.",
    },
  },
  {
    matches: exact("/"),
    meta: {
      title: "waytowalk — Real journeys. Your way.",
      description: siteDescription,
    },
  },
];

/**
 * Unknown paths render NotFound client-side, and the backend already serves
 * them `noindex`. Mirroring that default here keeps the client from briefly
 * advertising an indexable shell, and makes a newly added route fail closed
 * until it gets a deliberate rule.
 */
const FALLBACK: PageMeta = {
  title: "waytowalk — Real journeys. Your way.",
  description: siteDescription,
  robots: NOINDEX,
};

/** The same 1200×630 card the backend and `index.html` use. */
const DEFAULT_IMAGE = "/brand/og-default.png";

/**
 * Returns the rule's metadata with the default share image filled in. Routes
 * that own a stronger image (a shared trip's cover) override it in their own
 * `applyPageMeta` call, which runs after this one.
 */
export function metaForPath(pathname: string): PageMeta {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  for (const rule of RULES) {
    if (rule.matches(normalized)) {
      return { image: DEFAULT_IMAGE, ...rule.meta };
    }
  }
  return { image: DEFAULT_IMAGE, ...FALLBACK };
}
