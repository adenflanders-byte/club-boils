# Deploying the security update and School Events

Do these steps **in this order**. Each step is safe on its own, and the live
site keeps working throughout. Allow about 30 minutes.

## 1. Back up the database

In Supabase, go to **Database → Backups** and confirm a recent backup exists.
On the free plan there may be none, so also open **Table Editor** and export
`orders`, `accounts`, `settings` and `reviews` to CSV (⋯ → Export to CSV).

## 2. Run migration 001 (additive, safe while the old site is live)

Supabase → **SQL Editor** → New query → paste all of
`db/migrations/001_secure_foundation_and_school_events.sql` → **Run**.

It only adds new tables, columns and functions. It also seeds the Arthur Lok
Jack event with **no access code**, so nobody can get in until you set one.
Running it a second time does no harm.

## 3. Create your admin login (Supabase Auth)

1. Supabase → **Authentication → Users → Add user → Create new user**.
   Enter your email and a strong, new password, and tick **Auto Confirm User**.
2. In the SQL Editor, replace the email and run:
   ```sql
   insert into public.admin_users (user_id, email)
   select id, email from auth.users where email = 'you@example.com';
   ```
3. Recommended: go to **Authentication → Sign In / Providers** and turn off
   **Allow new users to sign up**. Only you create accounts.

To add another staff member later, repeat steps 1–2 for them. To remove
someone, run `delete from public.admin_users where email = '…';`.

## 4. Add environment variables in Vercel

Vercel → project → **Settings → Environment Variables**. Add each one for
**Production** and **Preview**:

| Name | Value |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` secret. **Never** put this in code or give it a `NEXT_PUBLIC_` prefix. |
| `SESSION_SECRET` | A random string of at least 48 characters. Generate one with a password manager; don't reuse a password. |
| `ANTHROPIC_API_KEY` | *(optional)* Only needed for receipt scanning in Accounts. |

## 5. Merge the pull request

Merging deploys automatically. When the deploy is live:

* Open `https://www.theclubboils.com/admin`. You should be sent to the new
  sign-in page. Sign in with the account from step 3.
* Check that orders, Accounts and School Events all load.
* Place a small test order on the main site, check it appears in Admin,
  then delete it.

## 6. Run migration 002 (locks down the public key)

Only after step 5 works. SQL Editor → paste
`db/migrations/002_lock_down_public_access.sql` → **Run**.

From now on, the public key in the browser can only read the menu settings and
approved reviews, and submit a review. Orders, accounts, payments and events
are reachable only through the signed-in server routes.

Check the result in the SQL Editor:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
select tablename, policyname, cmd from pg_policies where schemaname = 'public';
```

Every table should show `rowsecurity = true`. There should be exactly three
policies: read settings, read approved reviews, and submit an unapproved review.

## 7. Open the Arthur Lok Jack event

Admin → **🎓 School Events** → *Arthur Lok Jack Global School of Business*:

1. **Settings & access** → set an access code (6+ characters). It's stored
   scrambled and can't be shown again, so note it before you save.
2. Untick any items you don't want on this event's menu.
3. **Copy student link** and share the link and code with the class.

Ordering closes automatically at **9:30 AM on Thursday 15 October 2026**
(Trinidad time). That's enforced by the server and the database.

## On event day

* **Prep list** tab: totals per item, size, extras and heat, plus allergy notes.
* **Collection** tab: alphabetical list (or grouped by cohort), search by name,
  phone, student ID or order number, and print labels.
* **Mark collected** records who handed it over and when. It does **not** mark
  the order paid.
* Take cash with **Record Cash Received**. Confirm bank transfers with
  **Confirm Bank Transfer Received**, entering the amount, date and reference.
  Mistakes are fixed with **Record Refund**. Payments are never edited or deleted.

## If something goes wrong

* **Admin sign-in fails** → check step 3 (user exists, is confirmed and is in
  `admin_users`) and that `SESSION_SECRET` is set. After 5 wrong passwords,
  sign-in is blocked for 15 minutes.
* **"The server is not fully configured yet"** → an environment variable from
  step 4 is missing. Add it and redeploy.
* **The new site misbehaves after step 5** → Vercel → Deployments → pick the
  previous deployment → **Instant Rollback**. Migration 001 is additive, so the
  old version keeps working. Don't run step 6 until the new version is fine:
  after step 6 the old version can no longer read orders.
