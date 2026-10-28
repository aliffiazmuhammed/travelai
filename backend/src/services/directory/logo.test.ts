import { test } from 'node:test';
import assert from 'node:assert/strict';
import Agency from '../../models/Agency.js';
import AgencyProfile from '../../models/AgencyProfile.js';
import { loadPublicAgencyLogo, parseLogoAssetRef } from './logo.js';

/**
 * Milestone 9 D3 — the public logo. The bytes themselves are covered by the
 * browser smoke; these tests pin the security rule: only this tenant's own
 * server-generated asset pointer may ever be read, and only while the profile
 * is public.
 */

const AGENCY_A = '507f1f77bcf86cd799439011';
const AGENCY_B = '507f1f77bcf86cd799439012';
const ASSET_A = '507f1f77bcf86cd799439031';

function logoUrl(agencyId: string, assetId: string): string {
  return `/api/agency/${agencyId}/assets/${assetId}/content`;
}

test('only the owning tenant internal asset pointer resolves', () => {
  assert.deepEqual(parseLogoAssetRef(AGENCY_A, logoUrl(AGENCY_A, ASSET_A)), {
    agencyId: AGENCY_A,
    assetId: ASSET_A,
  });

  assert.equal(parseLogoAssetRef(AGENCY_A, logoUrl(AGENCY_B, ASSET_A)), null);
  assert.equal(parseLogoAssetRef(AGENCY_A, 'https://cdn.example.com/logo.png'), null);
  assert.equal(parseLogoAssetRef(AGENCY_A, '  '), null);
  assert.equal(parseLogoAssetRef(AGENCY_A, '/api/agency/../assets/x/content'), null);
});

test('a draft profile takes its logo down with it', async () => {
  const originals = {
    agencyFindOne: Agency.findOne,
    profileFindOne: AgencyProfile.findOne,
  };

  try {
    (Agency as any).findOne = () => ({
      lean: async () => ({
        _id: AGENCY_A,
        slug: 'hills-and-horizons',
        status: 'active',
        branding: { logoUrl: logoUrl(AGENCY_A, ASSET_A) },
      }),
    });
    (AgencyProfile as any).findOne = () => ({ lean: async () => null });

    assert.equal(await loadPublicAgencyLogo('hills-and-horizons'), null);
  } finally {
    (Agency as any).findOne = originals.agencyFindOne;
    (AgencyProfile as any).findOne = originals.profileFindOne;
  }
});
