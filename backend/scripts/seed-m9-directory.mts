/**
 * Milestone 9 demo seed — directory, packages, enquiries and ops identities.
 *
 * Builds the exact shape the D7 launch gate asks for, so the public directory,
 * reply-time line, enquiry form and admin moderation surfaces can be exercised
 * in a browser:
 *
 *   - 6 verified + published agencies, each with at least one priced package;
 *   - 1 unverified + published agency (the badge must stay off);
 *   - median reply times from 0 to 12 h (0 replies ⇒ the line stays hidden);
 *   - one answered ("won") lead, so the launch gate's third check passes;
 *   - one agency owner per tenant and one platform super-admin for `/admin`.
 *
 * Everything is labelled `m9-*` / `@m9-*.example`, so cleanup is exact. The
 * script is idempotent: re-running it removes the previous M9 demo rows first.
 *
 * Run from backend/:
 *   npx tsx scripts/seed-m9-directory.mts
 *   npx tsx scripts/seed-m9-directory.mts --clean
 *
 * Sign-ins (development only — never use these on a shared deployment):
 *   Platform admin: ops@m9.example / M9Ops!Pass123
 *   Agency owners:  <slug owner email> / M9Demo!Pass123
 *                   (listed in the summary output)
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import zlib from 'node:zlib';
import Agency from '../src/models/Agency.js';
import AgencyAsset from '../src/models/AgencyAsset.js';
import AgencyAudit from '../src/models/AgencyAudit.js';
import AgencyEnquiry from '../src/models/AgencyEnquiry.js';
import AgencyMember from '../src/models/AgencyMember.js';
import AgencyPackage from '../src/models/AgencyPackage.js';
import AgencyProfile from '../src/models/AgencyProfile.js';
import PlatformAudit from '../src/models/PlatformAudit.js';
import User from '../src/models/User.js';
import { uploadAgencyAsset } from '../src/services/agency/assets.js';
import { removeAgencyAssetFile } from '../src/services/agency/assetStorage.js';

const OWNER_PASSWORD = 'M9Demo!Pass123';
const ADMIN_EMAIL = 'ops@m9.example';
const ADMIN_PASSWORD = 'M9Ops!Pass123';
const ADMIN_NAME = 'M9 Demo Ops';

type Rgb = [number, number, number];

interface PackageSeed {
  title: string;
  summary: string;
  nights: number;
  price: number | null;
  highlights: string[];
  inclusions: string[];
}

interface AgencySeed {
  slug: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  city: string;
  gstin?: string;
  phone: string;
  website: string;
  about: string;
  destinations: string[];
  specialties: string[];
  services: string[];
  languages: string[];
  showPhone: boolean;
  showGstin: boolean;
  verified: boolean;
  /** Hours between creation and reply; `null` means no replies at all. */
  replyHours: number | null;
  replies: number;
  color: Rgb;
  accent: Rgb;
  packages: PackageSeed[];
}

const AGENCIES: AgencySeed[] = [
  {
    slug: 'm9-hills-horizons',
    name: 'Hills & Horizons Travel',
    ownerName: 'Asha Kulkarni',
    ownerEmail: 'asha@m9-hills.example',
    city: 'Pune',
    gstin: '27AABCH1234C1Z5',
    phone: '+91 98765 41001',
    website: 'https://hills-horizons.example',
    about:
      'We plan small-group treks and slow road trips across the western ghats for curious travellers. Every itinerary is walked by our own team before we sell it, so the monsoon detours and the quiet village stays are real.',
    destinations: ['Maharashtra', 'Goa', 'Karnataka'],
    specialties: ['Western ghats treks', 'Slow road trips', 'Monsoon escapes'],
    services: ['custom_itineraries', 'adventure', 'family_trips'],
    languages: ['en', 'hi', 'mr'],
    showPhone: true,
    showGstin: true,
    verified: true,
    replyHours: 3,
    replies: 6,
    color: [13, 148, 136],
    accent: [45, 212, 191],
    packages: [
      {
        title: 'Western ghats in the monsoon',
        summary: 'Five green days of forts, waterfalls and misty plateau walks.',
        nights: 4,
        price: 42000,
        highlights: ['Kaas plateau', 'Sinhagad fort walk', 'Lingmala falls'],
        inclusions: ['Stay in boutique homestays', 'Breakfast and dinner', 'Local guide'],
      },
      {
        title: 'Kaas wildflower weekend',
        summary: 'A slow weekend around the plateau, its lakes and flower meadows.',
        nights: 2,
        price: 28500,
        highlights: ['Kaas plateau', 'Thoseghar falls', 'Satara market'],
        inclusions: ['Boutique stay', 'All meals', 'Private transfer from Pune'],
      },
      {
        title: 'Konkan coast, built around you',
        summary: 'A flexible coastal route priced after we know your dates.',
        nights: 5,
        price: null,
        highlights: ['Tarkarli beach', 'Sindhudurg fort', 'Malvan seafood trail'],
        inclusions: ['Beach stay', 'Breakfast', 'Ferry tickets'],
      },
    ],
  },
  {
    slug: 'm9-coastal-compass',
    name: 'Coastal Compass',
    ownerName: 'Rohan Fernandes',
    ownerEmail: 'rohan@m9-coast.example',
    city: 'Panaji',
    phone: '+91 98765 41002',
    website: 'https://coastal-compass.example',
    about:
      'A tiny Goan studio for people who would rather meet a fisher than queue for a sunset point. We build unhurried coastal weeks with local cooks, boatmen and musicians, and we cap every departure at eight guests.',
    destinations: ['Goa', 'Konkan', 'Andaman'],
    specialties: ['Coastal stays', 'Food trails', 'Island hopping'],
    services: ['custom_itineraries', 'honeymoons', 'group_tours'],
    languages: ['en', 'hi', 'kn'],
    showPhone: true,
    showGstin: false,
    verified: true,
    replyHours: 6,
    replies: 5,
    color: [2, 132, 199],
    accent: [56, 189, 248],
    packages: [
      {
        title: 'South Goa, unhurried',
        summary: 'Six quiet days between fishing villages, river bends and empty sand.',
        nights: 5,
        price: 54000,
        highlights: ['Agonda', 'Cab de Rama', 'River cruise at twilight'],
        inclusions: ['Heritage homestay', 'Breakfast', 'Scooter hire'],
      },
    ],
  },
  {
    slug: 'm9-himalayan-trails',
    name: 'Himalayan Trails Co.',
    ownerName: 'Tenzin Norbu',
    ownerEmail: 'tenzin@m9-himalaya.example',
    city: 'Manali',
    phone: '+91 98765 41003',
    website: 'https://himalayan-trails.example',
    about:
      'Mountain specialists working only in Himachal and Ladakh. Our guides are born in the valleys we walk, every acclimatisation day is real, and we turn trips around when the weather says no instead of pushing on.',
    destinations: ['Himachal Pradesh', 'Ladakh', 'Uttarakhand'],
    specialties: ['High-altitude treks', 'Acclimatisation', 'Winter snow trips'],
    services: ['adventure', 'custom_itineraries', 'group_tours'],
    languages: ['en', 'hi'],
    showPhone: false,
    showGstin: false,
    verified: true,
    replyHours: 12,
    replies: 7,
    color: [79, 70, 229],
    accent: [129, 140, 248],
    packages: [
      {
        title: 'Hampta Pass crossing',
        summary: 'Five days from the green Kullu side over the pass into Lahaul.',
        nights: 4,
        price: 32500,
        highlights: ['Hampta pass', 'Chandratal', 'Jobra meadows'],
        inclusions: ['Twin-share tents', 'All meals on trek', 'Certified guide'],
      },
      {
        title: 'Ladakh, slowly',
        summary: 'Eight days with two full rest days built in for acclimatisation.',
        nights: 7,
        price: 78000,
        highlights: ['Nubra valley', 'Pangong lake', 'Thiksey monastery'],
        inclusions: ['Hotels and camps', 'Breakfast and dinner', 'Inner-line permits'],
      },
    ],
  },
  {
    slug: 'm9-desert-and-dunes',
    name: 'Desert & Dunes Journeys',
    ownerName: 'Meera Rathore',
    ownerEmail: 'meera@m9-desert.example',
    city: 'Jaipur',
    phone: '+91 98765 41004',
    website: 'https://desert-and-dunes.example',
    about:
      'Rajasthan without the coach bus: heritage havelis, desert camps run with the families who live there, and enough slack in the day to sit still. We plan for photographers, slow travellers and anyone allergic to a schedule.',
    destinations: ['Rajasthan', 'Gujarat'],
    specialties: ['Heritage stays', 'Desert camping', 'Photography tours'],
    services: ['custom_itineraries', 'honeymoons', 'destination_weddings'],
    languages: ['en', 'hi', 'gu'],
    showPhone: true,
    showGstin: false,
    verified: true,
    replyHours: 8,
    replies: 5,
    color: [217, 119, 6],
    accent: [251, 191, 36],
    packages: [
      {
        title: 'Thar by lantern light',
        summary: 'Four nights of havelis and dunes, with one full day of nothing.',
        nights: 4,
        price: 38000,
        highlights: ['Jaisalmer fort', 'Sam dunes', 'Bishnoi village'],
        inclusions: ['Heritage haveli', 'Desert camp', 'Private car and driver'],
      },
    ],
  },
  {
    slug: 'm9-backwater-bliss',
    name: 'Backwater Bliss',
    ownerName: 'Anitha Menon',
    ownerEmail: 'anitha@m9-backwater.example',
    city: 'Kochi',
    phone: '+91 98765 41005',
    website: 'https://backwater-bliss.example',
    about:
      'Kerala at river speed. We work with houseboat owners, toddy shops and spice farms we have known for years, and we keep groups small enough that the village still says hello when you walk through.',
    destinations: ['Kerala', 'Tamil Nadu'],
    specialties: ['Backwaters', 'Ayurveda', 'Spice trails'],
    services: ['custom_itineraries', 'family_trips', 'honeymoons'],
    languages: ['en', 'ml', 'ta'],
    showPhone: false,
    showGstin: false,
    verified: true,
    replyHours: 5,
    replies: 6,
    color: [5, 150, 105],
    accent: [52, 211, 153],
    packages: [
      {
        title: 'Alleppey to Kumarakom by water',
        summary: 'Three slow days on the backwaters with a village walk each morning.',
        nights: 3,
        price: 31000,
        highlights: ['Alleppey canals', 'Kumarakom bird sanctuary', 'Toddy shop lunch'],
        inclusions: ['Houseboat night', 'Homestay nights', 'All breakfasts'],
      },
    ],
  },
  {
    slug: 'm9-wildgrass-safaris',
    name: 'Wildgrass Safaris',
    ownerName: 'Vikram Shetty',
    ownerEmail: 'vikram@m9-wildgrass.example',
    city: 'Bengaluru',
    phone: '+91 98765 41006',
    website: 'https://wildgrass-safaris.example',
    about:
      'Naturalists first, travel agents second. We run small safari groups in the Western ghats and central India, with a maximum of four jeeps per departure and no promise of a tiger sighting that the forest cannot keep.',
    destinations: ['Karnataka', 'Madhya Pradesh', 'Tamil Nadu'],
    specialties: ['Wildlife safaris', 'Birding', 'Naturalist-led trips'],
    services: ['wildlife', 'adventure', 'custom_itineraries'],
    languages: ['en', 'kn', 'hi'],
    showPhone: true,
    showGstin: false,
    verified: true,
    replyHours: null,
    replies: 0,
    color: [120, 53, 15],
    accent: [180, 83, 9],
    packages: [
      {
        title: 'Kabini, four jeeps only',
        summary: 'Three nights of dawn and dusk safaris with a resident naturalist.',
        nights: 3,
        price: 65000,
        highlights: ['Nagarhole tiger reserve', 'Kabini backwaters', 'Night sounds walk'],
        inclusions: ['Jungle lodge', 'Six safaris', 'Naturalist'],
      },
    ],
  },
  {
    slug: 'm9-meghalaya-mist',
    name: 'Meghalaya Mist Travels',
    ownerName: 'Bani Khongwir',
    ownerEmail: 'bani@m9-meghalaya.example',
    city: 'Shillong',
    phone: '+91 98765 41007',
    website: 'https://meghalaya-mist.example',
    about:
      'A new Shillong collective focused on the living root bridges, cave systems and Khasi kitchens of the east. We are deliberately small while we train our first guides, and we publish every route we actually walk.',
    destinations: ['Meghalaya', 'Assam'],
    specialties: ['Living root bridges', 'Caving', 'Khasi food'],
    services: ['custom_itineraries', 'adventure'],
    languages: ['en', 'bn'],
    showPhone: true,
    showGstin: false,
    // Published but not verified on purpose: the badge must stay off.
    verified: false,
    replyHours: 4,
    replies: 5,
    color: [190, 24, 93],
    accent: [244, 114, 182],
    packages: [
      {
        title: 'Root bridges and rivers',
        summary: 'Four days of double-decker bridges, caves and waterfall swims.',
        nights: 4,
        price: 47500,
        highlights: ['Nongriat', 'Mawlynnong', 'Krang Suri falls'],
        inclusions: ['Homestays', 'Breakfast and dinner', 'Local guide'],
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  Tiny PNG writer (solid tile with diagonal accent stripes)                  */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function tilePng(
  width: number,
  height: number,
  base: Rgb,
  accent: Rgb
): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 3;
      const stripe = Math.floor((x + y) / 28) % 2 === 0;
      const [r, g, b] = stripe ? base : accent;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------------- */
/*  Cleanup and seed                                                          */
/* -------------------------------------------------------------------------- */

const SLUGS = AGENCIES.map((agency) => agency.slug);

async function cleanup(): Promise<number> {
  const existing = (await Agency.find({ slug: { $in: SLUGS } })
    .select('_id')
    .lean()) as unknown as Array<{ _id: Types.ObjectId }>;
  const ids = existing.map((row) => row._id);

  if (ids.length > 0) {
    const assets = (await AgencyAsset.find({ agencyId: { $in: ids } })
      .select('storageKey')
      .lean()) as Array<{ storageKey: string }>;
    for (const asset of assets) {
      await removeAgencyAssetFile(asset.storageKey).catch(() => undefined);
    }

    await Promise.all([
      AgencyProfile.deleteMany({ agencyId: { $in: ids } }),
      AgencyPackage.deleteMany({ agencyId: { $in: ids } }),
      AgencyEnquiry.deleteMany({ agencyId: { $in: ids } }),
      AgencyMember.deleteMany({ agencyId: { $in: ids } }),
      AgencyAsset.deleteMany({ agencyId: { $in: ids } }),
      AgencyAudit.deleteMany({ agencyId: { $in: ids } }),
      PlatformAudit.deleteMany({ targetId: { $in: ids.map(String) } }),
      User.deleteMany({ agencyId: { $in: ids }, accountType: 'agency' }),
    ]);
    await Agency.deleteMany({ _id: { $in: ids } });
  }

  await User.deleteMany({ email: ADMIN_EMAIL, accountType: 'platform' });
  return ids.length;
}

function daysAgo(days: number, hourOffset = 0): Date {
  return new Date(Date.now() - days * 86_400_000 - hourOffset * 3_600_000);
}

async function seed(): Promise<void> {
  const ownerHash = bcrypt.hashSync(OWNER_PASSWORD, 10);
  const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

  const admin = await User.create({
    email: ADMIN_EMAIL,
    password: adminHash,
    accountType: 'platform',
    platformRole: 'super_admin',
    name: ADMIN_NAME,
    status: 'active',
    mustChangePassword: false,
    tokenVersion: 0,
  });
  console.log(`platform admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

  const summary: Array<{ name: string; slug: string; password: string }> = [];

  for (const [index, config] of AGENCIES.entries()) {
    const ownerId = new Types.ObjectId();
    const publishedAt = daysAgo(index);

    const agency = await Agency.create({
      name: config.name,
      slug: config.slug,
      status: 'active',
      branding: {
        contactEmail: config.ownerEmail,
        contactPhone: config.phone,
        website: config.website,
        address: `${config.city}, India`,
        primaryColor: `#${config.color.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
        accentColor: `#${config.accent.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
      },
      gstin: config.gstin,
      createdBy: ownerId,
      provisionedBy: admin._id,
      provisionedAt: publishedAt,
      billing: {
        contactName: config.ownerName,
        contactEmail: config.ownerEmail,
        notes: 'M9 demo tenant.',
      },
    });

    await User.create({
      _id: ownerId,
      email: config.ownerEmail,
      password: ownerHash,
      accountType: 'agency',
      agencyId: agency._id,
      name: config.ownerName,
      status: 'active',
      mustChangePassword: false,
      tokenVersion: 0,
      createdBy: admin._id,
    });
    await AgencyMember.create({
      agencyId: agency._id,
      userId: ownerId,
      role: 'owner',
      joinedAt: publishedAt,
    });

    // Logo (also becomes branding.logoUrl) and one cover image for the cards.
    await uploadAgencyAsset({
      agencyId: String(agency._id),
      userId: String(ownerId),
      kind: 'logo',
      declaredMime: 'image/png',
      originalName: `${config.slug}-logo.png`,
      buffer: tilePng(256, 256, config.color, config.accent),
    });
    const cover = await uploadAgencyAsset({
      agencyId: String(agency._id),
      userId: String(ownerId),
      kind: 'image',
      declaredMime: 'image/png',
      originalName: `${config.slug}-cover.png`,
      buffer: tilePng(960, 600, config.color, config.accent),
    });

    await AgencyProfile.create({
      agencyId: agency._id,
      state: 'published',
      about: config.about,
      baseCity: config.city,
      destinations: config.destinations,
      specialties: config.specialties,
      services: config.services,
      languages: config.languages,
      showPhone: config.showPhone,
      showGstin: config.showGstin,
      publishedAt,
      verifiedAt: config.verified ? daysAgo(index + 2) : null,
      moderation: {},
    });

    for (const [order, pkg] of config.packages.entries()) {
      await AgencyPackage.create({
        agencyId: agency._id,
        title: pkg.title,
        summary: pkg.summary,
        nights: pkg.nights,
        fromPricePerPerson: pkg.price,
        currency: 'INR',
        coverAssetId: order === 0 ? cover.asset._id : null,
        highlights: pkg.highlights,
        inclusions: pkg.inclusions,
        state: 'published',
        order,
        publishedAt: daysAgo(index, order + 1),
        moderation: {},
      });
    }

    for (let n = 0; n < config.replies; n += 1) {
      const createdAt = daysAgo(index + 2 + n, n);
      const repliedAt =
        config.replyHours === null
          ? null
          : new Date(createdAt.getTime() + config.replyHours * 3_600_000);
      await AgencyEnquiry.create({
        agencyId: agency._id,
        contact: {
          name: `Demo Traveller ${n + 1}`,
          email: `traveller${n + 1}@m9-guest.example`,
          phone: '+91 90000 00000',
        },
        party: { adults: 2, children: 0 },
        dates: { flexible: true },
        budgetBand: '25k_50k',
        message:
          'We are planning a trip around these dates and would love your help shaping it. Is this route available?',
        source: 'profile',
        status: n === 0 ? 'won' : 'replied',
        consentAt: createdAt,
        repliedAt,
        ...(n === 0 ? { convertedAt: repliedAt } : {}),
        createdAt,
        updatedAt: repliedAt ?? createdAt,
      });
    }

    summary.push({
      name: config.name,
      slug: config.slug,
      password: OWNER_PASSWORD,
    });
  }

  console.log('\nSeeded directory agencies:');
  for (const row of summary) {
    console.log(`  /agencies/${row.slug}  ${row.name}`);
  }
  console.log(`\nowners use ${OWNER_PASSWORD} (see owner emails above)`);
}

async function run(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is required (see backend/.env).');
    process.exit(2);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`connected: ${mongoose.connection.name}`);

  try {
    const removed = await cleanup();
    console.log(`removed ${removed} previous M9 demo tenant(s).`);
    if (process.argv.includes('--clean')) {
      console.log('clean-only run finished.');
      return;
    }
    await seed();

    const published = await AgencyProfile.countDocuments({
      agencyId: {
        $in: (
          await Agency.find({ slug: { $in: SLUGS } }).select('_id').lean()
        ).map((row: any) => row._id),
      },
      state: 'published',
    });
    console.log(`\n${published} published profiles are ready at /agencies`);
    console.log(
      'Launch gate: npx tsx scripts/launch-gate-m9.mts\n'
    );
  } finally {
    await mongoose.connection.close();
  }
}

await run();
