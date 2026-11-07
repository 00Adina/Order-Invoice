/**
 * Creates (or promotes) an admin user.
 *   npm run create-admin -- admin@example.com 'a-strong-password'
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local / .env.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npm run create-admin -- <email> <password>");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Use a password of at least 10 characters.");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  let userId: string | undefined;
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.data.user) {
    userId = created.data.user.id;
    console.log(`Created user ${email}`);
  } else {
    // Already exists: find it and reset the password.
    for (let page = 1; !userId && page < 50; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      userId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
      if (data.users.length < 200) break;
    }
    if (!userId) throw created.error ?? new Error("Could not create or find user");
    await db.auth.admin.updateUserById(userId, { password });
    console.log(`User ${email} already existed; password updated`);
  }

  const { error } = await db.from("admins").upsert({ user_id: userId });
  if (error) throw error;
  console.log(`${email} is now an admin. Sign in at /login.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
