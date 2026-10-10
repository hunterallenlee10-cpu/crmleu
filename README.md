# LEU CRM

Internal CRM for **Lee Enterprises Unlimited**. Reps track cold outreach to local businesses, and the admin sees the whole pipeline.

Stack: Next.js (App Router, TypeScript) + Tailwind, with Supabase for Postgres, auth and row-level security, deployed on Vercel.

> **Build status:** Phases 1–3 are done: schema, row-level security, login, invites, rep screens, duplicate protection, admin screens, import and export. The n8n API and the seed script come in Phase 4.

## How permissions work

Permissions are enforced by Postgres row-level security (RLS) and triggers, not only by the UI. Everything is in `supabase/migrations/`.

- **Reps** see and edit only leads where they are the owner.
  - They can't reassign or delete leads.
  - They can't edit or delete activity entries.
  - They can't change their own role or commission rate.
- **Admins** can see and do everything.
- **No public sign-up.** The admin invites people by email, and every new user starts as a rep.
- **The service role key** is only used in server code (`src/lib/supabase/admin.ts`, marked `server-only`).

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project. Save the database password somewhere safe.
2. Push the database schema from your computer:
   ```bash
   npm install
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF   # the ref is in the project URL
   npx supabase db push
   ```
3. In the Supabase dashboard, go to **Authentication** and set the following:
   - **Sign In / Providers:**
     - Turn **off** "Allow new users to sign up".
     - Leave the **Email** provider **on**. Invited reps log in with email and password.
   - **URL Configuration:**
     - Set **Site URL** to your app's address, e.g. `https://crm.yourdomain.com`. While testing locally, use `http://localhost:3000`.
     - Add the same address under **Redirect URLs**.
   - **Emails → Templates.** Replace two templates so their links go through the app:
     - **Invite user:** paste the contents of `supabase/templates/invite.html`.
     - **Reset password:** paste the contents of `supabase/templates/recovery.html`.
   - **Emails → SMTP settings** (recommended). Supabase's built-in email only sends a few messages per hour. Add an SMTP provider (Resend, Postmark, Google Workspace, etc.) before inviting the whole team.

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill it in. The keys are under **Project Settings → API Keys** in Supabase.

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your project URL, e.g. `https://abcd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The **publishable** (or legacy "anon") key. Safe in the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | The **secret** (or legacy "service_role") key. **Server only.** Never add a `NEXT_PUBLIC_` prefix. |
| `NEXT_PUBLIC_SITE_URL` | Where the app lives, e.g. `https://crm.yourdomain.com` (no trailing slash) |
| `LEADS_API_KEY` | *(Phase 4)* A long random string that n8n sends to create leads |
| `WEBHOOK_URL` | *(Phase 4, optional)* Where stage changes are POSTed |

## 3. Create your first admin account

Public sign-up is off, so the first account is created by hand:

1. In Supabase, go to **Authentication → Users → Add user → Create new user**.
2. Enter your email and a password, and tick **Auto Confirm User**.
3. Open **SQL Editor** and run:
   ```sql
   update public.profiles
   set role = 'admin', full_name = 'Hunter Lee'
   where email = 'you@yourdomain.com';
   ```
4. Sign in to the app. **Team** in the menu is where you invite reps.

The database never lets a new user make themselves an admin. Admins can only be promoted with SQL like the above.

## 4. Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Or run a fully local Supabase in Docker instead of a hosted project:

```bash
npx supabase start   # prints a local URL plus publishable and secret keys for .env.local
npm run dev
```

Locally, emails (invites, password resets) don't actually send. They show up in Mailpit at http://127.0.0.1:54324. The local auth settings, including sign-up being off and the email templates, come from `supabase/config.toml`.

## 5. Tests

```bash
npm test                    # unit tests (normalization, New York dates, CSV parsing)
npm run test:db             # database tests, against a local Supabase (needs Docker + `npx supabase start`)
npm run test:db:no-docker   # the same database tests on a plain local Postgres + pgTAP (see scripts/db-test/run.sh)
```

The database tests (`supabase/tests/*.test.sql`) prove that:

- a rep cannot read, edit or delete another rep's lead, or see or add activities on it;
- a rep cannot reassign leads, delete leads, or edit or delete activity entries;
- a rep cannot change their own role or commission rate;
- a deactivated rep sees nothing, and logged-out visitors are refused;
- an admin can see, reassign and delete anything;
- duplicates are blocked: the same phone in any format, or the same business name and city;
- Lost requires a reason, Won requires a deal value and sets the won date, and stage changes are logged.

## 6. Admin guide

Admins get an **Admin** tab with four pages:

- **Dashboard:** revenue and deals won this month, commission owed per rep (won deal value × their rate), leads by stage per rep, and activities per rep this week (Monday to today). Every number uses New York time.
- **Team:**
  - Invite reps and set commission rates.
  - Deactivating someone blocks their login, and a banner then asks you to move their open leads to someone else. Their Won and Lost leads stay with them, so their commission history doesn't move.
- **Import:**
  1. Upload a CSV (in Google Sheets: **File → Download → .csv**).
  2. Match the columns to fields (most are guessed from the headers) and preview.
  3. **Check for duplicates.**
  4. Choose one owner or round robin, then import.

  Rows are skipped, with the reason shown, when:
  - the business name is missing,
  - the phone isn't a 10-digit US number,
  - the row is a duplicate of a lead already in the CRM, or of an earlier row in the same file,
  - or it's marked Won with no deal value.

  A Notes column becomes a note in each lead's history. Won rows without a won date count as won on the day you import. Up to 5,000 rows per file.
- **Export CSV:** downloads every lead with its owner. Only admins can download it.

On **Leads**, admins see every lead, can filter by owner, and can tick leads to reassign them in bulk. On a lead's page, admins can also change the owner, delete the lead, or delete history entries.

## 7. Deploy to Vercel

1. Push this repo to GitHub, then in Vercel choose **Add New → Project** and import it. The framework is detected as Next.js.
2. Under **Environment Variables**, add everything from step 2, with `NEXT_PUBLIC_SITE_URL` set to the production URL.
3. Deploy, then make sure Supabase's **Site URL** and **Redirect URLs** (step 1.3) match that production URL. Invite links won't work until they do.

## Project layout

```
supabase/migrations/    schema, triggers, RLS policies
supabase/tests/         pgTAP tests for permissions and lead rules
supabase/templates/     invite and password-reset emails
src/proxy.ts            sends logged-out visitors to /login and refreshes sessions
src/lib/supabase/       Supabase clients (server, browser, admin/service-role)
src/lib/auth.ts         getProfile() / requireAdmin() for pages and actions
src/lib/normalize.ts    phone / business-name normalization (mirrors the SQL)
src/lib/leads.ts        lead validation, duplicate check, and changeLeadStage() (every stage change goes through it)
src/lib/dates.ts        "today" and follow-up dates in America/New_York
src/app/(app)/today     overdue + due-today follow-ups, newly assigned leads
src/app/(app)/leads     my leads list, new lead, lead detail (edit, call/text, log, follow-up, stage, history)
src/app/(app)/pipeline  kanban board (press-and-hold to drag on phones)
src/app/(app)/admin     dashboard, team, CSV import (admins only)
src/app/api/export      CSV export (admins only)
src/lib/import-fields.ts  column matching and parsing for CSV import
src/app/login, auth/, set-password, forgot-password   sign-in flows
```
