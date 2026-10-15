"use client";

import { useState, useTransition } from "react";
import type { Profile } from "@/lib/types";
import { setActive, setCommissionRate, setMemberPassword } from "./actions";

export function MemberRow({ member, isMe, openLeads }: { member: Profile; isMe: boolean; openLeads: number }) {
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
    <li className={`card space-y-4 ${member.active ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{member.full_name}</p>
          <p className="text-sm text-muted">{member.email}</p>
          <p className="mt-1 text-xs text-muted">{openLeads} open lead{openLeads === 1 ? "" : "s"}</p>
        </div>
        <div className="flex gap-2 text-xs uppercase tracking-wide">
          <span className={member.role === "admin" ? "text-gold" : "text-muted"}>{member.role}</span>
          {!member.active && <span className="text-danger">inactive</span>}
        </div>
      </div>
      {(member.role !== "admin" || !isMe) && (
        <div className="flex flex-wrap items-end gap-3">
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
              <button type="submit" disabled={isPending} className="btn btn-ghost">Save</button>
            </form>
          )}
          {!isMe && member.active && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => { setShowPassword(!showPassword); setPasswordSet(false); setError(""); }}
              className="btn btn-ghost"
            >
              Set password
            </button>
          )}
          {!isMe && (
            <button type="button" disabled={isPending} onClick={toggleActive} className={`btn ${member.active ? "btn-danger" : "btn-ghost"}`}>
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
          <button type="submit" disabled={isPending} className="btn btn-gold">Save password</button>
        </form>
      )}
      {passwordSet && (
        <p role="status" className="text-sm text-ok">
          Password set. They can log in with {member.email} and the new password now. Send it to them privately.
        </p>
      )}
      {saved && <p role="status" className="text-sm text-ok">Rate saved.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </li>
  );
}
