// Fills the database with fake data for trying LEU CRM out:
// 1 admin, 5 reps, ~150 Maryland leads across every stage, and activity history.
//
//   npm run seed              add the demo data (local Supabase only)
//   npm run seed -- --reset   remove the demo data again
//   npm run seed -- --remote  allow a non-local Supabase (e.g. a staging project)
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
// All demo users have emails ending in @seed.leu.test. Phone numbers use the
// fictional 555-01xx range, so nobody real gets called.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD || "leu-demo-1234";
const args = new Set(process.argv.slice(2));

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url) && !args.has("--remote")) {
  console.error(`Refusing to seed ${url}: it isn't a local Supabase. Pass --remote if you really mean it.`);
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const DOMAIN = "@seed.leu.test";

// ---------------------------------------------------------------------------
// Repeatable "random" numbers so every seed run looks the same.
let state = 20261010;
const rand = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));

const todayNY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const addDays = (date, days) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysAgo = (days, hour = 10) => new Date(Date.now() - days * 86_400_000 - hour * 60_000).toISOString();

// ---------------------------------------------------------------------------
async function seedUsers() {
  const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const byEmail = new Map((existing?.users ?? []).map((u) => [u.email, u]));

  const people = [
    { email: `admin${DOMAIN}`, name: "Demo Admin", role: "admin", rate: 0 },
    { email: `ava${DOMAIN}`, name: "Ava Brooks", role: "rep", rate: 10 },
    { email: `marcus${DOMAIN}`, name: "Marcus Hill", role: "rep", rate: 12.5 },
    { email: `priya${DOMAIN}`, name: "Priya Patel", role: "rep", rate: 15 },
    { email: `diego${DOMAIN}`, name: "Diego Ramirez", role: "rep", rate: 10 },
    { email: `jordan${DOMAIN}`, name: "Jordan Lee", role: "rep", rate: 20 },
  ];

  for (const p of people) {
    let user = byEmail.get(p.email);
    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: p.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: p.name },
      });
      if (error) throw new Error(`Couldn't create ${p.email}: ${error.message}`);
      user = data.user;
    }
    p.id = user.id;
    const { error } = await supabase
      .from("profiles")
      .update({ role: p.role, commission_rate: p.rate, full_name: p.name, active: true })
      .eq("id", p.id);
    if (error) throw new Error(error.message);
  }
  return people;
}

// ---------------------------------------------------------------------------
const PLACES = ["Blue Ridge", "Chesapeake", "Patriot", "Liberty", "Harbor", "Summit", "Cedar Point", "Old Line",
  "Monocacy", "Potomac", "Catoctin", "Severn", "Antietam", "Linganore", "Bay Country", "Tidewater", "Ridgeline",
  "Carroll Creek", "Sugarloaf", "Mason-Dixon"];
const NICHES = {
  Roofing: ["Roofing", "Roof Pros", "Roofing & Gutters"],
  HVAC: ["Heating & Air", "HVAC", "Comfort Systems"],
  Plumbing: ["Plumbing", "Plumbing & Drain", "Pipe Works"],
  Landscaping: ["Landscaping", "Lawn & Garden", "Outdoor Living"],
  Dental: ["Family Dental", "Dental Care", "Smiles"],
  "Auto Repair": ["Auto Repair", "Auto Care", "Garage"],
  Cleaning: ["Cleaning Co.", "Maids", "Pressure Washing"],
  Restaurant: ["Grill", "Pizza", "Crab House"],
  Salon: ["Salon", "Barbershop", "Hair Studio"],
  "Law Firm": ["Law Group", "Legal", "Attorneys"],
};
const CITIES = ["Frederick", "Hagerstown", "Waldorf", "La Plata", "Annapolis", "Columbia", "Germantown",
  "Gaithersburg", "Bowie", "Leonardtown", "Mount Airy", "Westminster"];
const FIRST = ["Mike", "Sarah", "Dave", "Lisa", "Chris", "Tina", "Rob", "Angela", "Kevin", "Maria", "Tom", "Jess", "Ray", "Dana", "Luis", "Kim"];
const LAST = ["Johnson", "Miller", "Davis", "Garcia", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris"];
const LOST_REASONS = ["Too expensive", "Went with another company", "Not interested right now", "Already has a website", "Never responded", "Business closed"];
const STAGE_MIX = [
  ["new", 30], ["contacted", 25], ["spec_sent", 12], ["call_booked", 10],
  ["proposal_sent", 8], ["won", 8], ["lost", 7],
];
const AREA_CODES = ["301", "240", "410", "443"];

function pickStage() {
  let r = rand() * 100;
  for (const [stage, weight] of STAGE_MIX) if ((r -= weight) < 0) return stage;
  return "new";
}

function buildLeads(reps, count) {
  const today = todayNY();
  const monthStart = `${today.slice(0, 8)}01`;
  const daysIntoMonth = Number(today.slice(8, 10)) - 1;
  const used = new Set();
  const leads = [];

  for (let i = 0; i < count; i++) {
    const niche = pick(Object.keys(NICHES));
    let name;
    do name = `${pick(PLACES)} ${pick(NICHES[niche])}`; while (used.has(name));
    used.add(name);

    const stage = pickStage();
    const owner = reps[i % reps.length];
    const first = pick(FIRST);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const assignedDaysAgo = stage === "new" && rand() < 0.4 ? between(0, 4) : between(8, 75);

    const lead = {
      business_name: name,
      contact_name: `${first} ${pick(LAST)}`,
      // Fictional numbers: 555-0100 to 555-0199 in four Maryland area codes.
      phone: `${AREA_CODES[Math.floor(i / 100)]}5550${String(100 + (i % 100)).padStart(3, "0")}`,
      email: rand() < 0.6 ? `${first.toLowerCase()}@${slug}.example.com` : null,
      website: rand() < 0.5 ? `https://${slug}.example.com` : null,
      city: pick(CITIES),
      state: "MD",
      niche,
      source: rand() < 0.7 ? "manual" : rand() < 0.5 ? "import" : "api",
      stage,
      owner_id: owner.id,
      assigned_at: daysAgo(assignedDaysAgo),
      created_at: daysAgo(assignedDaysAgo),
      service_interest: pick(["website", "automation", "ai_call_answering", "multiple", null]),
      deal_value: null,
      spec_site_url: ["spec_sent", "call_booked", "proposal_sent", "won"].includes(stage) ? `https://spec-${slug}.example.com` : null,
      next_follow_up: null,
      do_not_contact: rand() < 0.03,
      lost_reason: null,
      won_date: null,
    };

    if (stage === "won") {
      lead.deal_value = pick([1500, 2500, 3000, 4500, 6000]);
      // About half of the wins land in the current month so the dashboard has numbers.
      lead.won_date = rand() < 0.5 ? addDays(monthStart, between(0, daysIntoMonth)) : addDays(monthStart, -between(1, 60));
    } else if (stage === "lost") {
      lead.lost_reason = pick(LOST_REASONS);
    } else {
      if (["proposal_sent", "call_booked"].includes(stage)) lead.deal_value = pick([1500, 2500, 3000, 4500]);
      // Spread follow-ups from a few days overdue to two weeks out (some unset).
      lead.next_follow_up = stage === "new" && rand() < 0.5 ? null : addDays(today, between(-5, 14));
    }
    leads.push(lead);
  }
  return leads;
}

function buildActivities(leads) {
  const notes = ["Left a voicemail", "Spoke with the owner, interested", "Sent the spec site link", "Asked to call back next week",
    "No answer", "Texted about the AI receptionist", "Wants pricing for a new website", "Booked a call for Thursday"];
  const activities = [];
  for (const lead of leads) {
    if (lead.stage === "new") continue;
    const n = between(1, 4);
    for (let k = 0; k < n; k++) {
      activities.push({
        lead_id: lead.id,
        user_id: lead.owner_id,
        type: pick(["call", "call", "text", "text", "note"]),
        body: pick(notes),
        created_at: daysAgo(between(0, 20), between(60, 600)),
      });
    }
  }
  return activities;
}

// ---------------------------------------------------------------------------
async function reset() {
  const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const seedUsers = (data?.users ?? []).filter((u) => u.email?.endsWith(DOMAIN));
  const ids = seedUsers.map((u) => u.id);
  if (ids.length) {
    // Activities go with their leads (on delete cascade).
    const { error } = await supabase.from("leads").delete().in("owner_id", ids);
    if (error) throw new Error(error.message);
    await supabase.from("activities").delete().in("user_id", ids);
  }
  for (const u of seedUsers) await supabase.auth.admin.deleteUser(u.id);
  console.log(`Removed ${seedUsers.length} demo users and their leads.`);
}

async function main() {
  if (args.has("--reset")) return reset();

  const people = await seedUsers();
  const reps = people.filter((p) => p.role === "rep");

  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .in("owner_id", reps.map((r) => r.id));
  if (count) {
    console.log(`Demo data is already there (${count} leads). Run with --reset first to start over.`);
  } else {
    let leads = buildLeads(reps, 150);
    // Skip any that clash with leads already in the database.
    const { data: clashes, error: dupError } = await supabase.rpc("check_duplicates_bulk", {
      p_phones: leads.map((l) => l.phone),
      p_business_names: leads.map((l) => l.business_name),
      p_cities: leads.map((l) => l.city),
    });
    if (dupError) throw new Error(dupError.message);
    const skip = new Set((clashes ?? []).map((c) => c.idx));
    leads = leads.filter((_, i) => !skip.has(i));

    const { data: saved, error } = await supabase.from("leads").insert(leads).select("id, business_name, owner_id, stage");
    if (error) throw new Error(`Couldn't insert leads: ${error.message}`);
    const activities = buildActivities(saved);
    const { error: actError } = await supabase.from("activities").insert(activities);
    if (actError) throw new Error(`Couldn't insert activities: ${actError.message}`);
    console.log(`Added ${saved.length} leads and ${activities.length} activities.`);
  }

  console.log(`\nLog in with any of these (password: ${password}):`);
  for (const p of people) console.log(`  ${p.role.padEnd(5)}  ${p.email}  (${p.name})`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
