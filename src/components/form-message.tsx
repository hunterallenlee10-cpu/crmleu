// `fields` echoes back what was typed, because React clears a form after
// its action runs and we don't want people retyping after an error.
export type FormState =
  | { error?: string; message?: string; fields?: Record<string, string> }
  | undefined;

export function FormMessage({ state }: { state: FormState }) {
  if (state?.error) {
    return (
      <p role="alert" className="rounded-control bg-danger/[0.1] px-3 py-2.5 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state?.message) {
    return (
      <p role="status" className="rounded-control bg-success/[0.1] px-3 py-2.5 text-sm text-success">
        {state.message}
      </p>
    );
  }
  return null;
}
