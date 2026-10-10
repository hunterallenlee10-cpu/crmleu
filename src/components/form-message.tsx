// `fields` echoes back what was typed, because React clears a form after
// its action runs and we don't want people retyping after an error.
export type FormState =
  | { error?: string; message?: string; fields?: Record<string, string> }
  | undefined;

export function FormMessage({ state }: { state: FormState }) {
  if (state?.error) {
    return (
      <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state?.message) {
    return (
      <p role="status" className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
        {state.message}
      </p>
    );
  }
  return null;
}
