"use client";

import { useActionState, useState, useTransition } from "react";
import { FormMessage } from "@/components/form-message";
import { deleteAnnouncement, postAnnouncement } from "./actions";

// Admin only: post a new announcement.
export function AnnouncementForm() {
  const [state, action, pending] = useActionState(postAnnouncement, undefined);
  // After an error, keep what was typed; after a post, start blank.
  const key = state?.error ? JSON.stringify(state.fields) : (state?.message ?? "new");

  return (
    <form action={action} className="space-y-2" key={key}>
      <label htmlFor="announcement-body" className="sr-only">New announcement</label>
      <textarea
        id="announcement-body"
        name="body"
        rows={3}
        required
        maxLength={2000}
        className="input resize-y py-3 leading-relaxed"
        placeholder="Post an announcement for the whole team…"
        defaultValue={state?.error ? (state.fields?.body ?? "") : ""}
      />
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto">
        {pending ? "Posting…" : "Post"}
      </button>
    </form>
  );
}

export function DeleteAnnouncement({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function onDelete() {
    if (!confirm("Delete this announcement? This can't be undone.")) return;
    setError("");
    startTransition(async () => {
      const res = await deleteAnnouncement(id);
      if (res.error) setError(res.error);
    });
  }

  return (
    <span className="ml-auto flex items-center gap-2">
      {error && <span role="alert" className="text-danger">{error}</span>}
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="rounded-[4px] font-medium underline-offset-4 hover:text-danger hover:underline disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
    </span>
  );
}
