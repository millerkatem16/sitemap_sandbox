/**
 * One-time script to create or update an admin account.
 * Run locally — never deployed as an API route.
 *
 * Usage:
 *   POSTGRES_URL="postgres://..." ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="yourpassword" node scripts/create-admin.js
 *
 * POSTGRES_URL is the same connection string Vercel sets automatically in deployed
 * functions. To get it, go to your Vercel dashboard → Storage → your Neon DB →
 * the ".env.local" tab, then copy the POSTGRES_URL value.
 *
 * If the email already exists in the admins table, this script updates the password.
 */

const bcrypt = require('bcryptjs');
const { sql } = require('@vercel/postgres');

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Error: ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.');
    console.error('Example:');
    console.error('  POSTGRES_URL="postgres://..." ADMIN_EMAIL="kate@example.com" ADMIN_PASSWORD="str0ngP@ss" node scripts/create-admin.js');
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const password_hash = await bcrypt.hash(password, 10);

  await sql`
    INSERT INTO admins (email, password_hash)
    VALUES (${normalizedEmail}, ${password_hash})
    ON CONFLICT (email) DO UPDATE SET password_hash = ${password_hash}
  `;

  console.log(`Admin account created/updated for: ${normalizedEmail}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Failed to create admin account:', err.message);
  process.exit(1);
});
