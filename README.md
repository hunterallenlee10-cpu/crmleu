# LEU CRM

Internal CRM for **Lee Enterprises Unlimited**. Reps track cold outreach to local businesses, and the admin sees the whole pipeline.

Stack: Next.js (App Router, TypeScript) + Tailwind, with Supabase for Postgres, auth and row-level security, deployed on Vercel.

**Contents:** [1. Supabase project](#1-create-the-supabase-project) · [2. Environment variables](#2-environment-variables) · [3. First admin](#3-create-your-first-admin-account) · [4. Run locally](#4-run-it-locally) · [5. Demo data](#5-demo-data-seed-script) · [6. Deploy to Vercel](#6-deploy-to-vercel) · [7. n8n API and webhook](#7-n8n-api-and-webhook) · [8. Admin guide](#8-admin-guide) · [9. Tests](#9-tests)

## How permissions work

Permissions are enforced by Postgres row-level security (RLS) and triggers, not only by the UI. Everything is in `supabase/migrations/`.

- **Reps** see and edit only leads where they are the owner.
  - They can't reassign or delete leads.
  - They can't edit or delete activity entries.
  - They can't change their own role or commission rate.
- **Tasks** are visible to the whole team. Only admins create, edit, assign or delete them.
  - A rep can tick off (or un-tick) tasks assigned to them, and tasks for the whole team.
  - They can see, but not tick off, tasks assigned to someone else.
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
     - Set **Site URL** to your app's address, e.g. `https://crm.yourdomain.com`.
     - Under **Redirect URLs**, add `https://crm.yourdomain.com/**`. Invite and reset links return to `/auth/callback`, so the `/**` matters. Add `http://localhost:3000/**` too if you run the app locally.
   - **Email (works out of the box).** Invites and password resets work with Supabase's built-in email; there are no templates to change.
     - The catch: it sends at most **2 emails an hour**, from a Supabase address, and Supabase calls it "for testing".
     - Fine for inviting a handful of reps over an afternoon.
     - To skip email entirely, use **Create invite link** on the Team page and text the link to the rep. It sends nothing, so the limit doesn't apply.
     - Inviting someone who already has an account (say they accepted a link but never set a password) sends them a link to sign in and choose a password instead. If they're deactivated, reactivate them first.
   - **Optional, for production email from your own domain:**
     1. Add an SMTP provider under **Emails → SMTP settings**, e.g. Resend (free for 3,000 emails a month).
     2. Then you can replace two templates under **Emails → Templates**: **Invite user** with `supabase/templates/invite.html`, and **Reset password** with `supabase/templates/recovery.html`.
     - On a free project, Supabase only allows template changes once custom SMTP is set up.
     - The app handles both kinds of links.

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill it in. The keys are under **Project Settings → API Keys** in Supabase.

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your project URL, e.g. `https://abcd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The **publishable** (or legacy "anon") key. Safe in the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | The **secret** (or legacy "service_role") key. **Server only.** Never add a `NEXT_PUBLIC_` prefix. |
| `NEXT_PUBLIC_SITE_URL` | Where the app lives, e.g. `https://crm.yourdomain.com` (no trailing slash) |
| `LEADS_API_KEY` | A long random secret that n8n sends to create leads. Generate one with `openssl rand -hex 32`. If it's empty, the API is turned off. |
| `WEBHOOK_URL` | *Optional.* If set, every stage change is POSTed here, e.g. an n8n webhook. |

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
4. Sign in to the app. **Admin → Team** is where you invite reps.

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

## 5. Demo data (seed script)

```bash
npm run seed              # adds 1 admin, 5 reps, 150 fake Maryland leads, and their activity history
npm run seed -- --reset   # removes all of it again
```

- **Logins:** every demo user's email ends in `@seed.leu.test`, and the password is `leu-demo-1234` (change it with `SEED_PASSWORD`). The script prints all six logins when it finishes.
- **Fake data:** phone numbers use the fictional 555-0100 to 555-0199 range, so nobody real gets called. About half the Won deals land in the current month, so the dashboard has numbers to show.
- **Safety:** the script reads `.env.local` and refuses to run against anything except a local Supabase unless you add `--remote`. Never seed your real production project.
- **Re-runs:** running it again doesn't duplicate anything.

## 6. Deploy to Vercel

1. Push this repo to GitHub, then in Vercel choose **Add New → Project** and import it. The framework is detected as Next.js.
2. Under **Environment Variables**, add everything from step 2:
   - Set `NEXT_PUBLIC_SITE_URL` to the production URL.
   - Use a fresh `LEADS_API_KEY`.
3. Deploy.
4. In Supabase, set **Site URL** and **Redirect URLs** (step 1.3) to that production URL. Invite links won't work until they match.
5. When a future change adds files to `supabase/migrations/`, run `npx supabase db push` to update the database before (or right after) deploying.

## 7. n8n API and webhook

### Create a lead: `POST /api/leads`

Send leads in from n8n (website forms, scrapers, etc.) with an **HTTP Request** node:

- **Method:** `POST`
- **URL:** `https://YOUR-APP/api/leads`
- **Headers:** `x-api-key: <LEADS_API_KEY>` and `Content-Type: application/json`
- **Body:** JSON with `business_name` (required) plus any of `contact_name`, `phone`, `email`, `website`, `city`, `state`, `niche`, `service_interest` (`website` / `automation` / `ai_call_answering` / `multiple`), `spec_site_url`, `next_follow_up` (`YYYY-MM-DD`), and `notes`.

```bash
curl -X POST https://YOUR-APP/api/leads \
  -H "x-api-key: $LEADS_API_KEY" -H "Content-Type: application/json" \
  -d '{"business_name":"Harbor Plumbing","contact_name":"Dana","phone":"(410) 555-0123","city":"Annapolis","state":"MD","niche":"Plumbing","notes":"Filled out the website form"}'
```

| Response | When |
|---|---|
| `201 {"result":"created","id":"…","owner":{"id","name","email"}}` | Saved. The lead is assigned round robin to the active rep who has waited longest. `owner` is `null` if there are no active reps; the lead then shows as Unassigned for the admin. |
| `409 {"result":"duplicate","reason":"phone" or "name_city"}` | The phone, or the business name + city, is already in the CRM. Nothing is saved, and the response doesn't say who owns it. |
| `400 {"result":"error","error":"…"}` | Missing `business_name`, a bad phone or email, or a body that isn't JSON. |
| `401` / `503` | Wrong or missing `x-api-key`, or `LEADS_API_KEY` isn't set on the server. |

Each new lead gets a "Created via API." note in its history, followed by your `notes` if you sent any. The `owner` email in the response is handy if you want n8n to tell the rep they have a new lead.

### Stage changes: `WEBHOOK_URL`

If `WEBHOOK_URL` is set, every stage change (from a lead's page or by dragging on the Pipeline) sends a POST like this:

```json
{
  "event": "stage_changed",
  "from_stage": "proposal_sent",
  "to_stage": "won",
  "changed_at": "2026-10-10T15:04:05.000Z",
  "lead": { "id": "…", "business_name": "Harbor Plumbing", "phone": "4105550123", "deal_value": 3000, "won_date": "2026-10-10", "…": "every lead field" },
  "owner": { "id": "…", "name": "Ava Brooks", "email": "ava@yourdomain.com" }
}
```

Stages are `new`, `contacted`, `spec_sent`, `call_booked`, `proposal_sent`, `won` and `lost`.

To kick off onboarding when a deal is won:
1. In n8n, add a **Webhook** node (POST) and put its **production** URL in `WEBHOOK_URL`.
2. Follow it with an **IF** node checking that `to_stage` equals `won`.

The CRM sends the POST after the rep's change has saved, waits at most 5 seconds, and ignores failures. If n8n is down, nothing breaks for the rep. A warning is written to the Vercel logs and that event is not re-sent.


## 8. Admin guide

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

**Tasks** (in the main nav, for everyone):
- Admins add a task with **+ New task**: a title, optional details, an optional due date, and who it's for (one person, or **Whole team**).
- Everyone sees every task, grouped by person, with **Everyone / Mine** filters. Overdue tasks show in red.
- Ticking a task off records who did it and when. Done tasks stay listed under each person for 30 days.
- Admins can edit, reassign or delete any task, and tick off anyone's.
- Each person's open tasks (theirs plus whole-team ones) also show at the top of **Today**.

On **Leads**, admins see every lead, can filter by owner, and can tick leads to reassign them in bulk. On a lead's page, admins can also change the owner, delete the lead, or delete history entries.

## 9. Tests

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
- Lost requires a reason, Won requires a deal value and sets the won date, and stage changes are logged;
- every active member sees every task, only an admin can create, edit or delete one, and a rep can tick off only their own or whole-team tasks.

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
src/app/(app)/tasks     team task list (admins assign; everyone ticks off their own)
src/app/(app)/admin     dashboard, team, CSV import (admins only)
src/app/api/export      CSV export (admins only)
src/app/api/leads       POST endpoint for n8n (API key)
src/lib/webhook.ts      stage-change webhook (WEBHOOK_URL)
scripts/seed.mjs        demo data
src/lib/import-fields.ts  column matching and parsing for CSV import
src/app/login, auth/, set-password, forgot-password   sign-in flows
src/app/auth/callback   finishes sign-in from Supabase's built-in invite/reset emails
src/app/auth/accept     invite links an admin copies and texts (signs in on tap)
```
