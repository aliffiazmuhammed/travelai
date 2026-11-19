/**
 * Legal copy for the public `/terms` and `/privacy` pages (Phase 1B).
 *
 * This is the rendered source of truth. `LEGAL_VERSIONS` must match
 * `backend/src/config/authPolicy.ts`; the sign-up form sends the versions it
 * renders, and the server rejects a stale pair rather than recording consent to
 * text the person never saw.
 *
 * Pending: the legal owner must review this wording before the consent flag is
 * enforced. Keep it plain, accurate to the product, and free of claims the
 * service does not support (no bookings, payments, or guaranteed availability).
 */

export const LEGAL_VERSIONS = {
  terms: '2026-11-17',
  privacy: '2026-11-17',
} as const;

export const LEGAL_LAST_UPDATED = '17 November 2026';

export interface LegalSection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'agreement',
    title: '1. Using waytowalk',
    paragraphs: [
      'These terms are an agreement between you and waytowalk for the use of the website and mobile app. By creating an account, you confirm that you are at least 16 years old and that you accept these terms and the Privacy Policy.',
      'If you use waytowalk for an agency or on behalf of someone else, you confirm that you are allowed to do so and that you accept these terms for that organisation as well.',
    ],
  },
  {
    id: 'your-account',
    title: '2. Your account',
    paragraphs: [
      'One account is for one person. Keep your email address current, choose a password you do not reuse elsewhere, and keep your sign-in details private. Tell us promptly if you believe someone else has access to your account.',
      'You are responsible for activity through your account. We may suspend or disable an account that is used for abuse, fraud, or content that breaks these terms.',
    ],
  },
  {
    id: 'trips',
    title: '3. Trips, plans and shared content',
    paragraphs: [
      'waytowalk lets you plan trips, publish itineraries to the public gallery, ask to join someone else’s trip, and collaborate with people you invite. Trip owners decide who may join and what collaborators can see or do.',
      'Anything you publish may be visible to other people, including people you have not met. Do not publish home addresses, phone numbers, identity documents, or another person’s private information without their permission.',
    ],
  },
  {
    id: 'agencies',
    title: '4. Agencies, enquiries and proposals',
    paragraphs: [
      'Agency profiles, packages, quotes, and proposals are supplied by the agency, not by waytowalk. When you send an enquiry or accept a proposal, the travel arrangement is between you and that agency.',
      'waytowalk does not take bookings, hold deposits, or process payments between travellers and agencies. Check an agency’s identity, terms, and price directly before you commit to anything.',
    ],
  },
  {
    id: 'assistant',
    title: '5. AI assistance',
    paragraphs: [
      'The assistant can draft ideas, summarise preferences, and help edit a plan. It can be wrong, incomplete, or out of date. Treat its output as a starting point and verify opening times, routes, prices, weather, visas, and safety information yourself.',
      'Do not rely on the assistant for medical, legal, financial, or emergency advice.',
    ],
  },
  {
    id: 'acceptable-use',
    title: '6. Acceptable use',
    paragraphs: ['You may not use waytowalk to:'],
    bullets: [
      'break the law, plan violence, or facilitate trafficking, fraud, or scams;',
      'harass, threaten, or discriminate against another person;',
      'publish spam, copied itineraries presented as your own, or advertising disguised as a trip;',
      'ask another traveller for money, deposits, gift cards, or bank details off the platform;',
      'scrape, probe, overload, or attempt to bypass the security or rate limits of the service;',
      'upload malware or content you do not have the right to share.',
    ],
  },
  {
    id: 'your-content',
    title: '7. Your content',
    paragraphs: [
      'You keep ownership of the trips, photos, messages, and profile details you create. You give waytowalk a limited licence to store, display, and adapt that content only as needed to run and improve the product — for example, showing a published trip in the gallery or syncing it to your devices.',
      'You can delete your content or your account. Some copies may remain briefly in backups, and content another member has already copied or exported is outside our control. We may remove content that breaks these terms or the law.',
    ],
  },
  {
    id: 'availability',
    title: '8. Availability and changes',
    paragraphs: [
      'waytowalk is a small, evolving product. Features may change, be marked as experimental, or be withdrawn. We aim for reliable service but cannot promise uninterrupted availability, and we are not responsible for a third-party map, weather, AI, or email provider being unavailable.',
      'We may update these terms when the product or the law changes. If a change materially affects your rights, we will give reasonable notice in the product or by email before it takes effect.',
    ],
  },
  {
    id: 'liability',
    title: '9. Disclaimers and liability',
    paragraphs: [
      'waytowalk is provided “as is” and “as available”. To the extent the law allows, we exclude implied warranties and are not liable for indirect or consequential loss, lost profits, or loss of data arising from your use of the service.',
      'Nothing in these terms limits rights that cannot be limited by law, including your statutory consumer rights. Where liability cannot be excluded, it is limited to the amount you paid waytowalk in the twelve months before the claim.',
    ],
  },
  {
    id: 'contact-terms',
    title: '10. Contact',
    paragraphs: [
      'Questions about these terms can be sent to the waytowalk team through the contact details published on the waytowalk website. Include the email address on your account so we can find the right record.',
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'scope',
    title: '1. What this policy covers',
    paragraphs: [
      'This policy explains what waytowalk collects, why, where it goes, and the choices you have. It covers the website, the mobile app, and the emails we send about your account and trips.',
    ],
  },
  {
    id: 'what-we-collect',
    title: '2. What we collect',
    paragraphs: ['We collect only what the product needs to work:'],
    bullets: [
      'Account details: email address, password hash, optional display name, photo, handle, and bio.',
      'Trip content: itineraries, day plans, expenses, packing lists, comments, votes, and files you add.',
      'Collaboration and enquiries: trip membership, join requests, messages, agency enquiries, quotes, proposal responses, and reports or blocks you submit.',
      'Technical data: IP address, device and browser type, session and security events, and error logs used to keep the service safe and working.',
      'Preferences: theme, language, and notification choices stored on your device or account.',
    ],
  },
  {
    id: 'why',
    title: '3. Why we use it',
    paragraphs: [
      'We use your data to create and secure your account, run your trips and collaborations, deliver enquiries and proposals, provide support, prevent abuse, and fix problems. We also use aggregated, de-identified information to understand which features help travellers and to improve the product.',
      'We send marketing email only when you opt in separately at sign-up or later in settings. You can unsubscribe from any marketing email, and doing so does not stop essential account or security messages.',
    ],
  },
  {
    id: 'chat',
    title: '4. Trip chat and encryption',
    paragraphs: [
      'Trip chat is designed with end-to-end encryption: the conversation key is held by members’ devices, and the server stores encrypted content it cannot read. The server still sees metadata such as who is in a trip, when a message was sent, and its size, and it stores the public keys devices publish for other members.',
      'If you enable encrypted chat backup, the recovery material is sealed with your password and stored so you can restore your key on another device. We cannot recover that key for you if you lose both the password and your recovery code.',
    ],
  },
  {
    id: 'sharing',
    title: '5. When we share data',
    paragraphs: [
      'We do not sell your personal data. We share it only in these situations:',
    ],
    bullets: [
      'With an agency when you choose to send an enquiry or share a trip, so it can reply and prepare a proposal.',
      'With service providers that host the app, send email, store images, or provide maps, weather, and AI features, under contracts that limit their use of the data.',
      'With other members of a trip or a public gallery visitor, when you publish content or join a shared trip.',
      'With authorities or another party when required by law, or when necessary to investigate abuse, fraud, or a serious safety risk.',
      'With a successor organisation if the service is merged or transferred, subject to this policy.',
    ],
  },
  {
    id: 'cookies',
    title: '6. Cookies and local storage',
    paragraphs: [
      'The website uses a session cookie to keep you signed in, a CSRF cookie to protect forms, and local storage for your theme and encrypted chat key material. We do not use advertising cookies or third-party trackers for cross-site profiling.',
    ],
  },
  {
    id: 'retention',
    title: '7. How long we keep data',
    paragraphs: [
      'We keep account and trip data while your account is active. When you delete your account, we remove or de-identify the data you own, except where we must keep a record for security, fraud prevention, or a legal obligation. Encrypted backups and disaster-recovery copies expire on a short, rolling schedule.',
    ],
  },
  {
    id: 'rights',
    title: '8. Your choices and rights',
    paragraphs: [
      'You can view and edit your profile and trip content in the app, export a trip, withdraw marketing consent, and ask us to delete your account. Depending on where you live, you may also have the right to request a copy of your data, correct it, restrict or object to some processing, or complain to a data-protection authority.',
      'To make a request, contact the waytowalk team through the contact details on the waytowalk website. We may need to verify that the account belongs to you before we act.',
    ],
  },
  {
    id: 'children',
    title: '9. Children',
    paragraphs: [
      'waytowalk is not intended for children under 16. If we learn that an account belongs to a child under 16, we will close it and delete the associated data.',
    ],
  },
  {
    id: 'changes',
    title: '10. Changes and contact',
    paragraphs: [
      'We will update the date at the top of this page when the policy changes. If a change materially affects how we use your data, we will give reasonable notice in the product or by email before it takes effect.',
      'Questions about privacy can be sent to the waytowalk team through the contact details published on the waytowalk website.',
    ],
  },
];
