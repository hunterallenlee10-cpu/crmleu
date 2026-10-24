// Promotions up for grabs on the Team chart, worked out from the same data
// the Ventures map shows, so the two always agree:
//   * President, CFO and Sales Manager are job titles. One is up for grabs
//     until someone active holds it.
//   * Each venture has one lead seat. "<venture> Lead" is up for grabs while
//     nobody leads it.
//   * Once it has a lead, "<venture> Co-Lead" is up for grabs until it has
//     MAX_CO_LEADS co-leads.
// Admins drag a promotion onto someone to give it to them.

// The database allows the same number (see the venture_co_leads migration).
export const MAX_CO_LEADS = 2;

export const TOP_ROLES = ["President", "CFO", "Sales Manager"] as const;

export type Seat =
  | { kind: "title"; title: string }
  | { kind: "lead"; ventureId: string }
  | { kind: "co_lead"; ventureId: string };

export type SeatVenture = { id: string; name: string; leadId: string | null; coLeadIds: string[] };
export type SeatPerson = { id: string; title: string | null };
// Extra fields on ventures or people (status, colour...) are kept as is.
export type Seats<V extends SeatVenture = SeatVenture, P extends SeatPerson = SeatPerson> = { ventures: V[]; people: P[] };

export type Promotion = { key: string; label: string; seat: Seat };

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function sameTitle(a: string | null | undefined, b: string | null | undefined) {
  return a != null && b != null && norm(a) === norm(b);
}

export function seatKey(seat: Seat) {
  return seat.kind === "title" ? `title:${norm(seat.title)}` : `${seat.kind}:${seat.ventureId}`;
}

export function seatLabel(seat: Seat, ventures: { id: string; name: string }[]) {
  if (seat.kind === "title") return seat.title;
  const name = ventures.find((v) => v.id === seat.ventureId)?.name ?? "Venture";
  return `${name} ${seat.kind === "lead" ? "Lead" : "Co-Lead"}`;
}

// What's still open, in the order the chart lists them. `people` should be
// the active team: a title only counts as taken while someone active has it.
export function openPromotions({ ventures, people }: Seats): Promotion[] {
  const open: Seat[] = [];
  for (const title of TOP_ROLES) {
    if (!people.some((p) => sameTitle(p.title, title))) open.push({ kind: "title", title });
  }
  for (const v of ventures) {
    if (!v.leadId) open.push({ kind: "lead", ventureId: v.id });
    else if (v.coLeadIds.length < MAX_CO_LEADS) open.push({ kind: "co_lead", ventureId: v.id });
  }
  return open.map((seat) => ({ key: seatKey(seat), label: seatLabel(seat, ventures), seat }));
}

// Whether a person can take a seat, and if not, why. Used before a drop is
// sent, and mirrors what the server action and database check.
export function canGive(
  state: Seats,
  personId: string,
  seat: Seat,
  name = "That person",
): { ok: true } | { ok: false; error: string } {
  if (seat.kind === "title") {
    const person = state.people.find((p) => p.id === personId);
    return person && sameTitle(person.title, seat.title)
      ? { ok: false, error: `${name} is already ${seat.title}.` }
      : { ok: true };
  }
  const v = state.ventures.find((x) => x.id === seat.ventureId);
  if (!v) return { ok: false, error: "That venture doesn't exist anymore." };
  if (v.leadId === personId) return { ok: false, error: `${name} already leads ${v.name}.` };
  if (seat.kind === "lead") {
    return v.leadId ? { ok: false, error: `${v.name} already has a lead.` } : { ok: true };
  }
  if (v.coLeadIds.includes(personId)) return { ok: false, error: `${name} is already a co-lead on ${v.name}.` };
  if (v.coLeadIds.length >= MAX_CO_LEADS) {
    return { ok: false, error: `${v.name} already has ${MAX_CO_LEADS} co-leads.` };
  }
  return { ok: true };
}

// The seats after giving one to someone. A co-lead who becomes the lead
// stops being a co-lead, like in the database.
export function giveSeat<S extends Seats>(state: S, personId: string, seat: Seat): S {
  if (seat.kind === "title") {
    return { ...state, people: state.people.map((p) => (p.id === personId ? { ...p, title: seat.title } : p)) };
  }
  return {
    ...state,
    ventures: state.ventures.map((v) => {
      if (v.id !== seat.ventureId) return v;
      return seat.kind === "lead"
        ? { ...v, leadId: personId, coLeadIds: v.coLeadIds.filter((id) => id !== personId) }
        : { ...v, coLeadIds: v.coLeadIds.includes(personId) ? v.coLeadIds : [...v.coLeadIds, personId] };
    }),
  };
}

// The seats after taking one back. Does nothing if they don't hold it.
export function takeSeat<S extends Seats>(state: S, personId: string, seat: Seat): S {
  if (seat.kind === "title") {
    return {
      ...state,
      people: state.people.map((p) => (p.id === personId && sameTitle(p.title, seat.title) ? { ...p, title: null } : p)),
    };
  }
  return {
    ...state,
    ventures: state.ventures.map((v) => {
      if (v.id !== seat.ventureId) return v;
      return seat.kind === "lead"
        ? { ...v, leadId: v.leadId === personId ? null : v.leadId }
        : { ...v, coLeadIds: v.coLeadIds.filter((id) => id !== personId) };
    }),
  };
}

// The ventures someone leads or co-leads, leads first, in map order.
export function seatsHeld<V extends SeatVenture>(ventures: V[], personId: string) {
  const lead = ventures.filter((v) => v.leadId === personId).map((v) => ({ venture: v, role: "lead" as const }));
  const co = ventures.filter((v) => v.coLeadIds.includes(personId)).map((v) => ({ venture: v, role: "co_lead" as const }));
  return [...lead, ...co];
}
