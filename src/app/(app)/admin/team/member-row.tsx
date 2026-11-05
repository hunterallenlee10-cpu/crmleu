"use client";

import { useState, useTransition } from "react";
import { MAX_TITLE } from "@/lib/hierarchy";
import type { Profile } from "@/lib/types";
import { setActive, setCommissionRate, setMemberPassword, setPosition } from "./actions";

export type Manager = { id: string; name: string };

export function MemberRow({
  member,
  isMe,
  openLeads,
  managers,
  names,
}: {
  member: Profile;
  isMe: boolean;
  openLeads: number;
  managers: Manager[]; // active people they could report to
  names: Record<string, string>; // everyone, for a manager who's since been deactivated
}) {
  const [rate, setRate] = useState(String(Number(member.commission_rate)));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [isPending, startTransition] = useTransition();

  function saveRate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    startTransition(async () => {
      const res = await setCommissionRate(member.id, Number(rate));
      if (res.error) setError(res.error);
      else setSaved(true);
    });
  }

  function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await setMemberPassword(member.id, password);
      if (res.error) return setError(res.error);
      setPasswordSet(true);
      setShowPassword(false);
      setPassword("");
    });
  }

  function toggleActive() {
    const msg = member.active
      ? `Deactivate ${member.full_name}? They won't be able to log in. You'll be asked to reassign their open leads next.`
      : `Reactivate ${member.full_name}? They'll be able to log in again.`;
    if (!confirm(msg)) return;
    setError("");
    startTransition(async () => {
      const res = await setActive(member.id, !member.active);
      if (res.error) setError(res.error);
    });
  }

  return (
    <li className={`card space-y-4 ${member.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{member.full_name}</p>
          <p className="text-label text-muted">{member.email}</p>
          <p className="mt-1 text-xs text-muted">{openLeads} open lead{openLeads === 1 ? "" : "s"}</p>
        </div>
        <div className="flex gap-1.5">
          <span className={`pill capitalize ${member.role === "admin" ? "pill-accent" : "pill-neutral"}`}>{member.role}</span>
          {!member.active && <span className="pill pill-danger capitalize">inactive</span>}
        </div>
      </div>
      {member.active && <PositionForm member={member} managers={managers} names={names} />}
      {(member.role !== "admin" || !isMe) && (
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
          {member.role !== "admin" && (
            <form onSubmit={saveRate} className="flex items-end gap-2">
              <div>
                <label htmlFor={`rate-${member.id}`} className="label">Commission %</label>
                <input
                  id={`rate-${member.id}`}
                  inputMode="decimal"
                  className="input w-24"
                  value={rate}
                  onChange={(e) => { setRate(e.target.value); setSaved(false); }}
                />
              </div>
              <button type="submit" disabled={isPending} className="btn btn-secondary">Save</button>
            </form>
          )}
          {!isMe && member.active && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => { setShowPassword(!showPassword); setPasswordSet(false); setError(""); }}
              className="btn btn-secondary"
            >
              Set password
            </button>
          )}
          {!isMe && (
            <button type="button" disabled={isPending} onClick={toggleActive} className={`btn ${member.active ? "btn-danger" : "btn-secondary"}`}>
              {member.active ? "Deactivate" : "Reactivate"}
            </button>
          )}
        </div>
      )}
      {showPassword && (
        <form onSubmit={savePassword} className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label htmlFor={`pw-${member.id}`} className="label">New password for {member.full_name}</label>
            {/* Plain text so you can see what you're about to send them. */}
            <input
              id={`pw-${member.id}`}
              type="text"
              autoComplete="off"
              minLength={8}
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={isPending} className="btn btn-primary">Save password</button>
        </form>
      )}
      {passwordSet && (
        <p role="status" className="text-sm text-success">
          Password set. They can log in with {member.email} and the new password now. Send it to them privately.
        </p>
      )}
      {saved && <p role="status" className="text-sm text-success">Rate saved.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </li>
  );
}

// Title and "Reports to", shown on the org chart in Ventures → Team.
function PositionForm({ member, managers, names }: { member: Profile; managers: Manager[]; names: Record<string, string> }) {
  const savedTitle = member.title ?? "";
  const savedBoss = member.reports_to ?? "";
  const [title, setTitle] = useState(savedTitle);
  const [boss, setBoss] = useState(savedBoss);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const changed = title.trim() !== savedTitle || boss !== savedBoss;

  // Keep a deactivated manager selectable so saving a title doesn't quietly drop them.
  const options = managers.filter((m) => m.id !== member.id);
  if (savedBoss && !options.some((m) => m.id === savedBoss)) options.push({ id: savedBoss, name: `${names[savedBoss] ?? "Former member"} (inactive)` });

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    startTransition(async () => {
      const res = await setPosition(member.id, title, boss);
      if (res.error) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <form onSubmit={save} className="space-y-2 border-t border-line pt-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor={`title-${member.id}`} className="label">Title</label>
          <input
            id={`title-${member.id}`}
            className="input"
            maxLength={MAX_TITLE}
            placeholder="e.g. Sales Manager"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setSaved(false); }}
          />
        </div>
        <div>
          <label htmlFor={`boss-${member.id}`} className="label">Reports to</label>
          <select
            id={`boss-${member.id}`}
            className="input"
            value={boss}
            onChange={(e) => { setBoss(e.target.value); setSaved(false); }}
          >
            <option value="">No one (top of the chart)</option>
            {options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <button type="submit" disabled={isPending || !changed} className="btn btn-secondary">Save</button>
      </div>
      {saved && <p role="status" className="text-sm text-success">Saved. It shows on Ventures → Team.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
  );
}
