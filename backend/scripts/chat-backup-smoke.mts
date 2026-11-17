/**
 * Chat backup integration smoke — disposable, database-backed, not part of CI.
 *
 * It exercises the real models and crypto against a local Mongo test database,
 * including the mobile key-backup implementation (so `mobile/node_modules` must
 * be installed). It never calls an HTTP route or sends email.
 *
 * Run from the repository root, in order, against a database whose name is
 * exactly `test` (the script refuses anything else):
 *
 *   npm run smoke:chat-backup --workspace=backend -- seed
 *   npm run smoke:chat-backup --workspace=backend -- reset-b
 *   npm run smoke:chat-backup --workspace=backend -- inspect
 *   npm run smoke:chat-backup --workspace=backend -- cleanup
 *
 * `seed` creates two isolated synthetic accounts, one trip with two backed-up
 * epochs and matching ciphertext; `reset-b` adds a password-reset fixture for
 * the second account; `inspect` checks row sizes and that no plaintext/key
 * fields were stored; `cleanup` removes every fixture row and asserts no
 * synthetic residue remains. `seed` refuses to run if the fixture ids already
 * exist, so a previous run must be cleaned up first.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import User from '../src/models/User.js';
import Trip from '../src/models/Trip.js';
import TripChatKey from '../src/models/TripChatKey.js';
import TripChatKeyBackup from '../src/models/TripChatKeyBackup.js';
import TripComment from '../src/models/TripComment.js';
import PasswordResetToken from '../src/models/PasswordResetToken.js';
import { createKeyBackupCrypto } from '../../mobile/src/lib/chatKeyBackupCrypto.ts';
import { createChatCrypto } from '../../mobile/src/lib/chatCrypto.ts';

const emails = ['recovery-phase1-a-20261117@example.test', 'recovery-phase1-b-20261117@example.test'];
const userIds = ['691ac50100000000000000a1', '691ac50100000000000000b1'].map((id) => new mongoose.Types.ObjectId(id));
const tripId = new mongoose.Types.ObjectId('691ac50100000000000000c1');
await mongoose.connect(env.MONGODB_URI);
try {
  assert.equal(mongoose.connection.db?.databaseName, 'test', 'Only the authorized test database may be used.');
  const mode = process.argv[2];
  if (mode === 'seed') {
    assert.equal(await User.countDocuments({ $or: [{ email: { $in: emails } }, { _id: { $in: userIds } }] }), 0);
    assert.equal(await Trip.countDocuments({ _id: tripId }), 0);
    const crypto = createKeyBackupCrypto((n) => new Uint8Array(randomBytes(n)));
    const chat = createChatCrypto((n) => new Uint8Array(randomBytes(n)));
    const identity = chat.mintIdentity();
    const key = crypto.generateAccountKey();
    const generation = crypto.generateGeneration();
    const password = await crypto.wrapPassword(String(userIds[0]), generation, 'RecoverySmoke!2026', key);
    const recovery = crypto.wrapRecovery(String(userIds[0]), generation, crypto.generateRecoveryCode(), key);
    const hash = await bcrypt.hash('RecoverySmoke!2026', 12);
    await User.create([
      { _id: userIds[0], email: emails[0], name: 'Recovery test A', password: hash, accountType: 'personal', status: 'active', chatPubKey: identity.pubKey, chatPubKeys: [identity.pubKey], keyBackup: { v: 1, generation, revision: 1, password, recovery } },
      { _id: userIds[1], email: emails[1], name: 'Recovery test B', password: hash, accountType: 'personal', status: 'active' },
    ]);
    await Trip.create({ _id: tripId, userId: userIds[0], title: 'Recovery verification trip', status: 'planned', tripDetails: { trip_title: 'Recovery verification trip', duration_days: 1, itinerary: [{ day: 1, title: 'A quiet day', activities: [] }] } });
    for (const epoch of [1, 2]) {
      const conversationKey = chat.generateConversationKey();
      const envelope = chat.wrapConversationKey(String(userIds[0]), identity, identity.pubKey, conversationKey);
      await TripChatKey.create({ tripId, epoch, createdBy: userIds[0], envelopes: { [identity.pubKey]: envelope } });
      await TripChatKeyBackup.create({ v: 1, userId: userIds[0], tripId, epoch, generation, rowRevision: 1, ...crypto.wrapTrip(String(userIds[0]), generation, String(tripId), epoch, conversationKey, key) });
      await TripComment.create({ tripId, userId: userIds[0], e2ee: true, body: chat.encryptText(conversationKey, `Synthetic readable epoch ${epoch}`) });
      conversationKey.fill(0);
    }
    identity.secretKey.fill(0);
    key.fill(0);
    console.log('Seeded two isolated synthetic accounts and one two-epoch backed-up trip; old device secrets discarded.');
  } else if (mode === 'reset-b') {
    assert.equal(await User.countDocuments({ _id: userIds[1], email: emails[1], accountType: 'personal' }), 1);
    const token = 'synthetic-recovery-phase1-reset-20261117';
    await PasswordResetToken.create({ userId: userIds[1], tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
    console.log('Created a synthetic reset fixture without sending email.');
  } else if (mode === 'inspect') {
    const rows = await TripChatKeyBackup.find({ tripId }).lean();
    for (const row of rows) {
      assert.equal(Buffer.from(row.ct, 'base64url').length, 48);
      assert.equal(Buffer.from(row.iv, 'base64url').length, 12);
      assert.ok(!Object.keys(row).some((key) => ['key', 'accountKey', 'recoveryCode', 'plaintext'].includes(key)));
    }
    const accounts = await User.find({ _id: { $in: userIds }, email: { $in: emails } }).select('+keyBackup').lean();
    console.log(JSON.stringify({ backupRows: rows.length, accounts: accounts.map((user) => ({ enrolled: !!user.keyBackup, revision: user.keyBackup?.revision, passwordWrapped: !!user.keyBackup?.password })) }));
  } else if (mode === 'cleanup') {
    const accounts = await User.find({ _id: { $in: userIds }, email: { $in: emails }, accountType: 'personal' }).select('_id').lean();
    assert.equal(accounts.length, 2, 'Refusing cleanup: synthetic fixture identities do not match.');
    const db = mongoose.connection.db!;
    for (const { name } of await db.listCollections().toArray()) {
      if (name === 'users' || name === 'trips') continue;
      await db.collection(name).deleteMany({ $or: [{ tripId }, { userId: { $in: userIds } }] });
    }
    await Trip.deleteOne({ _id: tripId, userId: userIds[0] });
    await User.deleteMany({ _id: { $in: userIds }, email: { $in: emails }, accountType: 'personal' });
    for (const { name } of await db.listCollections().toArray()) {
      const left = await db.collection(name).countDocuments({ $or: [{ tripId }, { userId: { $in: userIds } }, { email: { $in: emails } }, { _id: { $in: [...userIds, tripId] } }] });
      assert.equal(left, 0, `Synthetic residue in ${name}`);
    }
    console.log('Removed synthetic fixtures and confirmed no matching records remain.');
  } else throw new Error('Choose seed, reset-b, inspect or cleanup.');
} finally {
  await mongoose.disconnect();
}
