// Bootstrap (or reset the password of) an admin dashboard account.
//
// Usage:
//   npm run admin:create-user -- <username> <password>
//
// Needs DATABASE_URL in the environment (e.g. run with `railway run` against
// the production database, or export it locally first).

import { upsertAdminUser } from "../app/adminAuth.server";
import { pool } from "../app/db.server";

async function main() {
  const [username, password] = process.argv.slice(2);

  if (!username || !password) {
    console.error("Usage: npm run admin:create-user -- <username> <password>");
    process.exitCode = 1;
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exitCode = 1;
    return;
  }

  await upsertAdminUser(username, password);
  console.log(`✓ Admin account "${username.trim().toLowerCase()}" is ready.`);
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool().end();
  });
