"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form-message";
import { SERVICE_INTERESTS, type Lead } from "@/lib/types";
import { formatPhone } from "@/lib/normalize";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

// Create and edit form for a lead. Stage and follow-up have their own
// controls on the lead page, so the edit form leaves them out.
export function LeadForm({
  action,
  lead,
  niches,
  submitLabel,
}: {
  action: Action;
  lead?: Lead;
  niches: string[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isNew = !lead;

  // After a submit, show what was typed; otherwise show the saved lead.
  const value = (name: keyof Lead) => {
    if (state?.fields) return state.fields[name] ?? "";
    const v = lead?.[name];
    if (name === "phone") return formatPhone(v as string | null);
    return v == null ? "" : String(v);
  };
  const dnc = state?.fields ? state.fields.do_not_contact === "on" : (lead?.do_not_contact ?? false);
  // Remount inputs when the values behind them change.
  const key = JSON.stringify(state?.fields ?? lead?.updated_at ?? "");

  return (
    <form action={formAction} className="space-y-5" key={key}>
      <Field name="business_name" label="Business name" required defaultValue={value("business_name")} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="contact_name" label="Contact name" defaultValue={value("contact_name")} />
        <Field name="phone" label="Phone" type="tel" inputMode="tel" defaultValue={value("phone")} />
        <Field name="email" label="Email" type="email" defaultValue={value("email")} />
        <Field name="website" label="Website" inputMode="url" defaultValue={value("website")} />
        <Field name="city" label="City" defaultValue={value("city")} />
        <Field name="state" label="State" defaultValue={value("state")} maxLength={20} />
        <div>
          <label htmlFor="niche" className="label">Niche</label>
          <input id="niche" name="niche" list="niche-options" defaultValue={value("niche")} className="input" placeholder="e.g. Roofing" />
          <datalist id="niche-options">
            {niches.map((n) => <option key={n} value={n} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor="service_interest" className="label">Service interest</label>
          <select id="service_interest" name="service_interest" defaultValue={value("service_interest")} className="input">
            <option value="">Not sure yet</option>
            {SERVICE_INTERESTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <Field name="deal_value" label="Deal value ($)" inputMode="decimal" defaultValue={value("deal_value")} />
        <Field name="spec_site_url" label="Spec site URL" inputMode="url" defaultValue={value("spec_site_url")} />
        {isNew && <Field name="next_follow_up" label="Next follow-up" type="date" defaultValue={value("next_follow_up")} />}
      </div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line px-4">
        <input type="checkbox" name="do_not_contact" defaultChecked={dnc} className="size-5 accent-[var(--color-danger)]" />
        <span>Do not contact</span>
      </label>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="btn btn-gold w-full sm:w-auto">
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  ...props
}: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
        {props.required && <span className="text-gold"> *</span>}
      </label>
      <input id={name} name={name} className="input" {...props} />
    </div>
  );
}
