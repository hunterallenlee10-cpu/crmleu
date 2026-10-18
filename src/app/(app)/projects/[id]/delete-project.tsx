"use client";

import { useState, useTransition } from "react";
import { deleteProject } from "../actions";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button
        type="button"
        className="btn btn-danger"
        disabled={isPending}
        onClick={() => {
          if (!confirm("Delete this project and its checklist? This can't be undone.")) return;
          startTransition(async () => {
            const res = await deleteProject(projectId);
            if (res?.error) setError(res.error);
          });
        }}
      >
        Delete project
      </button>
    </div>
  );
}
