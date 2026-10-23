import Link from "next/link";
import { buildOrgTree, type OrgNode, type OrgPerson } from "@/lib/hierarchy";
import { STATUS_COLOR, STATUS_LABEL, type VentureStatus } from "@/lib/ventures";

export type ChartPerson = OrgPerson & {
  color: string;
  isMe: boolean;
  ventures: { id: string; name: string; status: VentureStatus }[]; // the ones they run
  openTasks: number;
};

type Node = OrgNode<ChartPerson>;

// The team's org chart, for everyone. Admins set titles and who reports to
// whom on Admin → Team. Computers get a top-down chart; phones an outline.
export function TeamChart({ people, isAdmin }: { people: ChartPerson[]; isAdmin: boolean }) {
  const tree = buildOrgTree(people);
  const branches = tree.filter((n) => n.reports.length);
  const loose = tree.filter((n) => !n.reports.length);

  if (!people.length) return <div className="empty"><p>No one on the team yet.</p></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Who reports to whom, what they run and how many tasks they have open.
        </p>
        {isAdmin && (
          <Link href="/admin/team" className="btn btn-secondary">Edit titles and who reports to whom</Link>
        )}
      </div>

      {!branches.length && (
        <p className="rounded-control border border-dashed border-line-strong px-4 py-3 text-sm text-muted">
          {isAdmin
            ? "Nobody reports to anyone yet. Set a title and \"Reports to\" for each person on Admin → Team and the chart fills in here."
            : "The chart fills in once an admin sets who reports to whom."}
        </p>
      )}

      {/* Computers: top-down chart. Wide teams scroll sideways. */}
      <div className="space-y-5 max-md:hidden">
        {branches.map((n) => (
          <section key={n.person.id} className="card overflow-x-auto">
            <div className="mx-auto flex w-max flex-col items-center px-2 pb-2">
              <ChartBranch node={n} />
            </div>
          </section>
        ))}
        {loose.length > 0 && (
          <section className="card space-y-3">
            {branches.length > 0 && (
              <h2 className="group-title text-muted">Not placed under anyone yet</h2>
            )}
            <ul className="flex flex-wrap gap-3">
              {loose.map((n) => (
                <li key={n.person.id}>
                  <PersonCard node={n} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Phones: an indented outline. */}
      <ul className="space-y-3 md:hidden">
        {tree.map((n) => <OutlineItem key={n.person.id} node={n} />)}
      </ul>
    </div>
  );
}

function ChartBranch({ node }: { node: Node }) {
  return (
    <>
      <PersonCard node={node} />
      {node.reports.length > 0 && (
        <ul className="org-children">
          {node.reports.map((r) => (
            <li key={r.person.id}>
              <ChartBranch node={r} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function OutlineItem({ node }: { node: Node }) {
  return (
    <li className="space-y-3">
      <PersonCard node={node} wide />
      {node.reports.length > 0 && (
        <ul className="ml-3 space-y-3 border-l border-line-strong pl-3">
          {node.reports.map((r) => <OutlineItem key={r.person.id} node={r} />)}
        </ul>
      )}
    </li>
  );
}

function PersonCard({ node, wide = false }: { node: Node; wide?: boolean }) {
  const p = node.person;
  const reports = node.size - 1;
  const role = p.role === "admin" ? "Admin" : "Team member";
  const facts = [
    `${p.openTasks} open task${p.openTasks === 1 ? "" : "s"}`,
    reports ? `${reports} under them` : null,
  ].filter(Boolean);

  return (
    <article
      className={`space-y-2 rounded-card border bg-surface-2 p-3 text-left text-sm ${wide ? "w-full" : "w-56"} ${
        p.isMe ? "border-accent shadow-[inset_0_0_0_1px_var(--color-accent)]" : "border-line"
      }`}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
        <div className="min-w-0">
          <p className="font-semibold break-words">
            {p.name}
            {p.isMe && <span className="ml-1.5 text-xs font-medium text-accent-strong">You</span>}
          </p>
          <p className="break-words text-label text-muted">{p.title ?? role}</p>
        </div>
      </div>
      {p.ventures.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Ventures ${p.name} runs`}>
          {p.ventures.map((v) => (
            <li
              key={v.id}
              className="inline-flex max-w-full items-center gap-1.5 rounded-control bg-fg/[0.06] px-2 py-0.5 text-xs"
              title={`${v.name} · ${STATUS_LABEL[v.status]}`}
            >
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${v.status === "idea" ? "border-[1.5px] bg-surface" : ""}`}
                style={v.status === "idea" ? { borderColor: STATUS_COLOR[v.status] } : { background: STATUS_COLOR[v.status] }}
              />
              <span className="truncate">{v.name}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{facts.join(" · ")}</p>
    </article>
  );
}
