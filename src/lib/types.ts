import type { VentureStatus } from "./ventures";

// Row shapes for the tables in supabase/migrations.

export type Role = "admin" | "rep";

export type Stage =
  | "new"
  | "contacted"
  | "warm_up_program"
  | "call_booked"
  | "quote_given"
  | "won"
  | "lost";

export type LeadSource = "manual" | "import" | "api";

export type ServiceInterest = "website" | "automation" | "ai_call_answering" | "multiple";

export type ActivityType =
  | "call"
  | "text"
  | "email"
  | "meeting"
  | "note"
  | "stage_change"
  | "reassignment";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
  commission_rate: number;
  created_at: string;
};

export type Lead = {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  niche: string | null;
  source: LeadSource;
  stage: Stage;
  owner_id: string | null;
  assigned_at: string | null;
  service_interest: ServiceInterest | null;
  deal_value: number | null;
  spec_site_url: string | null;
  next_follow_up: string | null; // YYYY-MM-DD
  do_not_contact: boolean;
  lost_reason: string | null;
  won_date: string | null; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
};

export type Activity = {
  id: number;
  lead_id: string;
  user_id: string | null;
  type: ActivityType;
  body: string | null;
  created_at: string;
};

export const STAGES: { value: Stage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "warm_up_program", label: "Warm Up Program" },
  { value: "call_booked", label: "Call Booked" },
  { value: "quote_given", label: "Quote Given" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export const SERVICE_INTERESTS: { value: ServiceInterest; label: string }[] = [
  { value: "website", label: "Website" },
  { value: "automation", label: "Automation" },
  { value: "ai_call_answering", label: "AI call answering" },
  { value: "multiple", label: "Multiple" },
];

export function stageLabel(stage: Stage) {
  return STAGES.find((s) => s.value === stage)?.label ?? stage;
}

export type Task = {
  id: string;
  title: string;
  details: string | null;
  assignee_id: string | null; // null = whole team
  everyone_must_complete: boolean; // whole-team task every rep ticks off for themselves
  due_date: string | null; // YYYY-MM-DD
  venture_id: string | null;
  created_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
};

// From everyone_task_progress(): one row per rep who has to tick an everyone task.
export type EveryoneProgress = {
  task_id: string;
  user_id: string;
  full_name: string;
  checked_at: string | null;
};

// From the team_members view: names only, readable by everyone on the team.
export type TeamMember = {
  id: string;
  full_name: string;
  role: Role;
  active: boolean;
};

// A big branch of LEU; a spoke on the Ventures map. Tasks hang off it.
export type Venture = {
  id: string;
  name: string;
  position: number;
  description: string | null;
  lead_id: string | null; // who runs it
  status: VentureStatus;
  start_date: string | null; // YYYY-MM-DD
  target_date: string | null; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
};
