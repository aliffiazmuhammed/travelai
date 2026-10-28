/**
 * Milestone 9 D7 launch gate (read-only).
 *
 * Exits non-zero until the directory is ready to announce:
 *
 * 1. at least five published + verified profiles on active agencies;
 * 2. every one of those profiles shows at least one published, priced package
 *    (so "from ₹…" is never a bluff);
 * 3. at least one of those agencies answered a real test enquiry end-to-end
 *    (a replied/quoted/won lead, or a reply timestamp).
 *
 * Run against the target database with:
 *   npx tsx scripts/launch-gate-m9.mts
 *
 * Nothing is written. `MONGODB_URI` is required.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Agency from '../src/models/Agency.js';
import AgencyEnquiry from '../src/models/AgencyEnquiry.js';
import AgencyPackage from '../src/models/AgencyPackage.js';
import AgencyProfile from '../src/models/AgencyProfile.js';
import { publicProfileFilter } from '../src/services/directory/profile.js';

const MIN_PROFILES = 5;

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is required to run the launch gate.');
  process.exit(2);
}

interface Check {
  label: string;
  pass: boolean;
  detail: string;
}

function report(checks: Check[]): void {
  for (const check of checks) {
    console.log(`${check.pass ? 'PASS' : 'FAIL'}  ${check.label} — ${check.detail}`);
  }
}

await mongoose.connect(uri);
try {
  const profiles = (await AgencyProfile.find({
    ...publicProfileFilter(),
    verifiedAt: { $ne: null },
  })
    .select('agencyId')
    .lean()) as Array<{ agencyId: mongoose.Types.ObjectId }>;

  const profileAgencyIds = profiles.map((profile) => profile.agencyId);
  const activeAgencies = (await Agency.find({
    _id: { $in: profileAgencyIds },
    status: 'active',
  })
    .select('_id name slug')
    .lean()) as unknown as Array<{
    _id: mongoose.Types.ObjectId;
    name: string;
    slug: string;
  }>;
  const activeById = new Map(
    activeAgencies.map((agency) => [String(agency._id), agency])
  );
  const eligible = profileAgencyIds
    .map((id) => activeById.get(String(id)))
    .filter((agency): agency is (typeof activeAgencies)[number] => Boolean(agency));

  const pricedPackages = (await AgencyPackage.find({
    agencyId: { $in: eligible.map((agency) => agency._id) },
    state: 'published',
    publishedAt: { $ne: null },
    'moderation.hiddenAt': null,
    fromPricePerPerson: { $ne: null },
  })
    .select('agencyId')
    .lean()) as Array<{ agencyId: mongoose.Types.ObjectId }>;

  const pricedAgencyIds = new Set(
    pricedPackages.map((pkg) => String(pkg.agencyId))
  );
  const withoutPrice = eligible.filter(
    (agency) => !pricedAgencyIds.has(String(agency._id))
  );

  const answered = await AgencyEnquiry.countDocuments({
    agencyId: { $in: eligible.map((agency) => agency._id) },
    $or: [
      { repliedAt: { $type: 'date' } },
      { status: { $in: ['replied', 'quoted', 'won'] } },
    ],
  });

  const checks: Check[] = [
    {
      label: 'Published + verified profiles',
      pass: eligible.length >= MIN_PROFILES,
      detail: `${eligible.length} of ${MIN_PROFILES} required${
        eligible.length > 0
          ? ` (${eligible.map((agency) => agency.slug || agency.name).join(', ')})`
          : ''
      }`,
    },
    {
      label: 'Priced package on every eligible profile',
      pass: eligible.length > 0 && withoutPrice.length === 0,
      detail: withoutPrice.length
        ? `missing a published price: ${withoutPrice
            .map((agency) => agency.slug || agency.name)
            .join(', ')}`
        : eligible.length === 0
          ? 'no eligible profiles yet'
          : 'every eligible profile has at least one priced package',
    },
    {
      label: 'Answered test enquiry',
      pass: answered > 0,
      detail:
        answered > 0
          ? `${answered} replied/quoted/won lead${answered === 1 ? '' : 's'}`
          : 'no lead has been answered yet',
    },
  ];

  report(checks);
  if (checks.some((check) => !check.pass)) {
    console.error('\nLaunch gate is not met.');
    process.exitCode = 1;
  } else {
    console.log('\nLaunch gate met.');
  }
} finally {
  await mongoose.connection.close();
}
