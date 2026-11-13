import { MAX_TITLE } from "./hierarchy";

// Promotions up for grabs on the Team chart, worked out from the same data
// the Ventures map shows, so the two always agree:
//   * Title promotions (President, CFO, Sales Manager, and any an admin types
//     in) live in the promotions table. One is up for grabs until someone
//     active has that title.
//   * Each venture has one lead seat. "<venture> Lead" is up for grabs while
//     nobody leads it.
// Admins drag a promotion onto someone to give it to them.

// Listed before the promotions migration has run (they can't be removed then).
export const DEFAULT_TITLES = ["President", "CFO", "Sales Manager"] as const;

export type Seat = { kind: "title"; title: string } | { kind: "lead"; ventureId: string };

export type SeatVenture = { id: string; name: string; leadId: string | null };
export type SeatPerson = { id: string; title: string | null };
// id is null for the built-in fallbacks, which can't be removed.
export type TitlePromotion = { id: string | null; title: string };
// Extra fields on ventures or people (status, colour...) are kept as is.
export type Seats<V extends SeatVenture = SeatVenture, P extends SeatPerson = SeatPerson> = {
  ventures: V[];
  people: P[];
  titles: TitlePromotion[];
};

export type Promotion = { key: string; label: string; seat: Seat; removableId: string | null };

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function sameTitle(a: string | null | undefined, b: string | null | undefined) {
  return a != null && b != null && norm(a) === norm(b);
}

export function seatKey(seat: Seat) {
  return seat.kind === "title" ? `title:${norm(seat.title)}` : `lead:${seat.ventureId}`;
}

const leadLabel = (ventureName: string) => `${ventureName} Lead`;

export function seatLabel(seat: Seat, ventures: { id: string; name: string }[]) {
  if (seat.kind === "title") return seat.title;
  return leadLabel(ventures.find((v) => v.id === seat.ventureId)?.name ?? "Venture");
}

// What's still open, in the order the chart lists them. `people` should be
// the active team: a title only counts as taken while someone active has it.
export function openPromotions({ ventures, people, titles }: Seats): Promotion[] {
  const open: Promotion[] = [];
  for (const t of titles) {
    if (people.some((p) => sameTitle(p.title, t.title))) continue;
    const seat: Seat = { kind: "title", title: t.title };
    open.push({ key: seatKey(seat), label: t.title, seat, removableId: t.id });
  }
  for (const v of ventures) {
    if (v.leadId) continue;
    const seat: Seat = { kind: "lead", ventureId: v.id };
    open.push({ key: seatKey(seat), label: leadLabel(v.name), seat, removableId: null });
  }
  return open;
}

// Checks a promotion an admin typed in. It can't repeat one that's already
// listed, or a venture's lead seat (those come and go with the venture).
export function parseNewPromotion(
  raw: string,
  state: Pick<Seats, "titles" | "ventures">,
): { ok: true; title: string } | { ok: false; error: string } {
  const title = raw.replace(/\s+/g, " ").trim();
  if (!title) return { ok: false, error: "Type the promotion first." };
  if (title.length > MAX_TITLE) return { ok: false, error: `Keep promotions to ${MAX_TITLE} characters or fewer.` };
  if (state.titles.some((t) => sameTitle(t.title, title))) return { ok: false, error: `${title} is already a promotion.` };
  const venture = state.ventures.find((v) => sameTitle(leadLabel(v.name), title));
  if (venture) {
    return { ok: false, error: `${leadLabel(venture.name)} comes from the ${venture.name} venture, so it's already handled.` };
  }
  return { ok: true, title };
}

// Whether a person can take a seat, and if not, why. Used before a drop is
// sent, and mirrors what the server action checks.
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
  if (v.leadId) return { ok: false, error: `${v.name} already has a lead.` };
  return { ok: true };
}

// The seats after giving one to someone.
export function giveSeat<S extends Seats>(state: S, personId: string, seat: Seat): S {
  if (seat.kind === "title") {
    return { ...state, people: state.people.map((p) => (p.id === personId ? { ...p, title: seat.title } : p)) };
  }
  return {
    ...state,
    ventures: state.ventures.map((v) => (v.id === seat.ventureId ? { ...v, leadId: personId } : v)),
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
    ventures: state.ventures.map((v) =>
      v.id === seat.ventureId && v.leadId === personId ? { ...v, leadId: null } : v,
    ),
  };
}

// The ventures someone leads, in map order.
export function venturesLed<V extends SeatVenture>(ventures: V[], personId: string) {
  return ventures.filter((v) => v.leadId === personId);
}
