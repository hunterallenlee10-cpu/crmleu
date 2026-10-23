// The team's org chart: who reports to whom. Only active people are drawn.
// Anyone whose manager is missing or deactivated goes to the top, so nobody
// disappears from the chart.

export const MAX_TITLE = 60;

export type OrgPerson = {
  id: string;
  name: string;
  role: "admin" | "rep";
  title: string | null;
  reportsTo: string | null;
};

export type OrgNode<P extends OrgPerson = OrgPerson> = { person: P; reports: OrgNode<P>[]; size: number };

// Admins first at the top, then by name; everyone else by name.
function byRoleThenName(a: OrgPerson, b: OrgPerson) {
  return (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1) || a.name.localeCompare(b.name);
}

export function buildOrgTree<P extends OrgPerson>(people: P[]): OrgNode<P>[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const children = new Map<string, P[]>();
  const roots: P[] = [];
  for (const p of people) {
    const boss = p.reportsTo && p.reportsTo !== p.id ? byId.get(p.reportsTo) : undefined;
    if (boss) children.set(boss.id, [...(children.get(boss.id) ?? []), p]);
    else roots.push(p);
  }

  // The database blocks loops, but if one slipped in, the people in it would
  // never be reached from the top. Lift one of them up so they still show.
  const placed = new Set<string>();
  const build = (p: P): OrgNode<P> => {
    placed.add(p.id);
    const reports = (children.get(p.id) ?? [])
      .filter((c) => !placed.has(c.id))
      .sort(byRoleThenName)
      .map(build);
    return { person: p, reports, size: 1 + reports.reduce((n, r) => n + r.size, 0) };
  };
  const tree = roots.sort(byRoleThenName).map(build);
  for (const p of [...people].sort(byRoleThenName)) {
    if (!placed.has(p.id)) tree.push(build(p));
  }
  return tree;
}

// Normalises a title the way the database does. Blank means none.
export function parseTitle(raw: string): { ok: true; title: string | null } | { ok: false; error: string } {
  const title = raw.replace(/\s+/g, " ").trim();
  if (title.length > MAX_TITLE) return { ok: false, error: `Keep titles to ${MAX_TITLE} characters or fewer.` };
  return { ok: true, title: title || null };
}
