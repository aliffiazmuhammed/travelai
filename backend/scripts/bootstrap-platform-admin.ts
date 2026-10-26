/**
 * PA1 platform-admin bootstrap.
 *
 * Creates the FIRST platform super-admin account without ever exposing a public
 * signup path. The account is created with a random temporary password and
 * `mustChangePassword: true`, so the first successful login is forced through
 * `/admin` -> set a new password before any other admin route opens.
 *
 * The temporary password is printed once to stdout and is never logged anywhere
 * else. Treat the terminal output as a secret and clear it after use.
 *
 * Usage:
 *   npm run bootstrap:platform-admin -- --email ops@example.com [--name "Ops"]
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI ?? '';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function log(message: string): void {
  console.log(`bootstrap:platform-admin — ${message}`);
}

function fail(message: string): never {
  console.error(`bootstrap:platform-admin — ${message}`);
  process.exit(1);
}

async function run(): Promise<void> {
  const email = String(argValue('email') ?? '').trim().toLowerCase();
  const name = String(argValue('name') ?? '').replace(/\s+/g, ' ').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail('provide a valid address with --email ops@example.com');
  }
  if (name.length > 40) {
    fail('--name must be 40 characters or fewer');
  }
  if (!MONGODB_URI) {
    fail('MONGODB_URI is not set. Aborting (nothing was changed).');
  }

  await mongoose.connect(MONGODB_URI);
  log(`connected (${mongoose.connection.name})`);

  try {
    const existing = await User.findOne({
      email,
      accountType: 'platform',
    })
      .select('_id status platformRole')
      .lean();

    if (existing) {
      fail(
        `a platform account already exists for ${email} (status: ${existing.status}). ` +
          'Refusing to overwrite it; use the PA2 admin surface to manage platform accounts.'
      );
    }

    // One-time secret: 24 base64url characters plus a fixed prefix so printed
    // output is unambiguous when copied from a terminal.
    const temporaryPassword = `Tv!${crypto.randomBytes(18).toString('base64url')}`;
    const password = await bcrypt.hash(temporaryPassword, 12);

    const user = new User({
      email,
      password,
      accountType: 'platform',
      platformRole: 'super_admin',
      status: 'active',
      mustChangePassword: true,
      tokenVersion: 0,
      ...(name ? { name } : {}),
    });
    await user.save();

    console.log('');
    log('created the first platform super-admin:');
    console.log(`  id:             ${String(user._id)}`);
    console.log(`  email:          ${email}`);
    console.log(`  temporary pass: ${temporaryPassword}`);
    console.log('');
    console.log('Sign in at /admin/login and set a new password immediately.');
    console.log('This password is shown once and is not stored in plaintext.');
  } finally {
    await mongoose.connection.close();
  }
}

run().catch((error) => {
  console.error('bootstrap:platform-admin — failed:', error);
  process.exitCode = 1;
});
