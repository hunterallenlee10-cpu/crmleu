"use client";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { createContext, use, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { buildOrgTree, type OrgNode, type OrgPerson } from "@/lib/hierarchy";
import {
  canGive,
  giveSeat as giveLocal,
  openPromotions,
  parseNewPromotion,
  seatLabel,
  takeSeat as takeLocal,
  venturesLed,
  type Promotion,
  type Seat,
  type SeatPerson,
  type Seats,
  type TitlePromotion,
} from "@/lib/promotions";
import { STATUS_COLOR, STATUS_LABEL, type VentureStatus } from "@/lib/ventures";
import { FitChart } from "./fit-chart";
import { addPromotion, giveSeat, removePromotion, takeSeat } from "./team-actions";

export type ChartPerson = OrgPerson & {
  color: string;
  isMe: boolean;
  openTasks: number;
};

// A venture's lead seat, the same one the Ventures map shows.
export type ChartVenture = {
  id: string;
  name: string;
  status: VentureStatus;
  leadId: string | null;
};

type Node = OrgNode<ChartPerson>;
type ChartSeats = Seats<ChartVenture, SeatPerson>;
type Change =
  | { type: "give" | "take"; personId: string; seat: Seat }
  | { type: "add"; title: string }
  | { type: "remove"; id: string };
type Notice = { tone: "success" | "error"; text: string; undo?: () => void };
type Place = "desktop" | "phone"; // each card and promotion is drawn once per layout

type Chart = {
  isAdmin: boolean;
  seats: ChartSeats;
  dragging: Promotion | null;
  picked: Promotion | null;
  pick: (p: Promotion | null) => void;
  give: (personId: string, seat: Seat) => void;
  take: (personId: string, seat: Seat) => void;
  add: (raw: string) => string | null; // returns an error to show by the box
  remove: (promotion: Promotion) => void;
};
const ChartContext = createContext<Chart | null>(null);
const useChart = () => use(ChartContext)!;

// Typed-in promotions show straight away; this marks one that isn't saved yet.
const UNSAVED = "unsaved:";

function applyChange(state: ChartSeats, c: Change): ChartSeats {
  switch (c.type) {
    case "give":
      return giveLocal(state, c.personId, c.seat);
    case "take":
      return takeLocal(state, c.personId, c.seat);
    case "add":
      return { ...state, titles: [...state.titles, { id: `${UNSAVED}${c.title}`, title: c.title }] };
    case "remove":
      return { ...state, titles: state.titles.filter((t) => t.id !== c.id) };
  }
}

function save(c: Change) {
  switch (c.type) {
    case "give":
      return giveSeat(c.personId, c.seat);
    case "take":
      return takeSeat(c.personId, c.seat);
    case "add":
      return addPromotion(c.title);
    case "remove":
      return removePromotion(c.id);
  }
}

// The team's org chart, for everyone. Admins set titles and who reports to
// whom on Admin → Team, and run "Promotions up for grabs" here: type a new
// one onto the board, drag one onto a person (or tap it, then tap "Give" on
// their card), or remove one. A venture's lead seat is the one on the
// Ventures map, so the two always match. Co-leads are picked in each
// venture's own form, not here. Computers get a top-down chart; phones an
// outline.
export function TeamChart({
  people,
  ventures,
  titles,
  isAdmin,
}: {
  people: ChartPerson[];
  ventures: ChartVenture[];
  titles: TitlePromotion[];
  isAdmin: boolean;
}) {
  const base = useMemo<ChartSeats>(
    () => ({ ventures, titles, people: people.map((p) => ({ id: p.id, title: p.title })) }),
    [ventures, titles, people],
  );
  const [seats, apply] = useOptimistic(base, applyChange);
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<Promotion | null>(null);
  const [picked, setPicked] = useState<Promotion | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Mouse: drag after moving a little, so a click still picks. Touch: press
  // and hold, so swiping still scrolls.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "That person";
  const titleOf = (id: string) => seats.people.find((p) => p.id === id)?.title ?? null;

  // Runs a change on screen straight away and saves it; puts it back on error.
  function run(changes: Change[], success: Notice | null) {
    setNotice(null);
    startTransition(async () => {
      for (const c of changes) apply(c);
      for (const c of changes) {
        const res = await save(c);
        if (res.error) {
          setNotice({ tone: "error", text: res.error });
          return;
        }
      }
      setNotice(success);
    });
  }

  function give(personId: string, seat: Seat) {
    setPicked(null);
    const name = nameOf(personId);
    const ok = canGive(seats, personId, seat, name);
    if (!ok.ok) return setNotice({ tone: "error", text: ok.error });

    const label = seatLabel(seat, seats.ventures);
    const before = seat.kind === "title" ? titleOf(personId) : null;
    // Undo puts back exactly what was there before.
    const undo: Change =
      before ? { type: "give", personId, seat: { kind: "title", title: before } } : { type: "take", personId, seat };
    run([{ type: "give", personId, seat }], {
      tone: "success",
      text: `${name} is now ${label}${before ? ` (was ${before})` : ""}.`,
      undo: () => run([undo], { tone: "success", text: "Undone." }),
    });
  }

  function take(personId: string, seat: Seat) {
    const label = seat.kind === "title" ? seat.title : seatLabel(seat, seats.ventures);
    run([{ type: "take", personId, seat }], {
      tone: "success",
      text: `${nameOf(personId)} is no longer ${label}.`,
      undo: () => run([{ type: "give", personId, seat }], { tone: "success", text: "Undone." }),
    });
  }

  function add(raw: string) {
    const parsed = parseNewPromotion(raw, seats);
    if (!parsed.ok) return parsed.error;
    setPicked(null);
    run([{ type: "add", title: parsed.title }], {
      tone: "success",
      text: `Added ${parsed.title}. Drag it onto someone to give it to them.`,
    });
    return null;
  }

  function remove(promotion: Promotion) {
    if (!promotion.removableId || promotion.removableId.startsWith(UNSAVED)) return;
    if (picked?.key === promotion.key) setPicked(null);
    run([{ type: "remove", id: promotion.removableId }], {
      tone: "success",
      text: `Took ${promotion.label} off the board.`,
      undo: () => run([{ type: "add", title: promotion.label }], { tone: "success", text: "Undone." }),
    });
  }

  function onDragStart(e: DragStartEvent) {
    setNotice(null);
    setPicked(null);
    setDragging((e.active.data.current?.promotion as Promotion | undefined) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const promotion = e.active.data.current?.promotion as Promotion | undefined;
    const personId = e.over?.data.current?.personId as string | undefined;
    if (promotion && personId) give(personId, promotion.seat);
  }

  const promotions = openPromotions(seats);
  const tree = buildOrgTree(people);
  const branches = tree.filter((n) => n.reports.length);
  const loose = tree.filter((n) => !n.reports.length);
  // The space beside the top of the chart is free when the top person has
  // just one report, so the list can sit in that corner on big screens.
  const corner = branches[0]?.reports.length === 1;

  if (!people.length) return <div className="empty"><p>No one on the team yet.</p></div>;

  const chart: Chart = { isAdmin, seats, dragging, picked, pick: setPicked, give, take, add, remove };

  return (
    <ChartContext value={chart}>
      <DndContext
        id="team-chart" // keeps its accessibility ids the same on the server and in the browser
        sensors={sensors}
        collisionDetection={pointerWithin}
        accessibility={{
          screenReaderInstructions: {
            draggable: "Press to pick this promotion, then press Give on the card of the person who gets it.",
          },
        }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Who reports to whom, what they lead and how many tasks they have open.
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

          {/* Computers: top-down chart. Boxes stretch and shrink to fit the card,
              and big teams wrap (see FitChart). */}
          <div className="space-y-5 max-md:hidden">
            {!branches.length && <OpenRoles promotions={promotions} place="desktop" className="card" />}
            {branches.map((n, i) => (
              <FitChart key={n.person.id} className="card relative overflow-x-auto">
                {i === 0 && (
                  <OpenRoles
                    promotions={promotions}
                    place="desktop"
                    className={`mb-5 ${corner ? "lg:absolute lg:top-5 lg:left-5 lg:z-10 lg:mb-0 lg:w-72" : ""}`}
                  />
                )}
                <div className="flex w-full min-w-min flex-col items-center pb-2">
                  <ChartBranch node={n} />
                </div>
              </FitChart>
            ))}
            {loose.length > 0 && (
              <section className="card space-y-3">
                {branches.length > 0 && (
                  <h2 className="group-title text-muted">Not placed under anyone yet</h2>
                )}
                <ul className="flex flex-wrap gap-3">
                  {loose.map((n) => (
                    <li key={n.person.id}>
                      <PersonCard node={n} size="fixed" place="desktop" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Phones: an indented outline. */}
          <OpenRoles promotions={promotions} place="phone" className="card md:hidden" />
          <ul className="space-y-3 md:hidden">
            {tree.map((n) => <OutlineItem key={n.person.id} node={n} />)}
          </ul>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging ? <RoleChip label={dragging.label} lifted /> : null}
        </DragOverlay>
        {notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}
      </DndContext>
    </ChartContext>
  );
}

function NoticeBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const error = notice.tone === "error";
  return (
    // Floats at the bottom of the screen (above the phone nav), so the chart
    // never moves under a drag.
    <div
      role={error ? "alert" : "status"}
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      className={`fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-card border bg-surface-2 px-4 py-3 text-sm shadow-float motion-safe:animate-pop-in md:bottom-6 ${
        error ? "border-danger/40 text-danger" : "border-line-strong"
      }`}
    >
      <span className="min-w-0 flex-1">{notice.text}</span>
      {notice.undo && (
        <button type="button" onClick={notice.undo} className="font-medium text-accent-strong hover:underline">
          Undo
        </button>
      )}
      <button type="button" onClick={onClose} aria-label="Dismiss" className="text-muted hover:text-fg">
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

function OpenRoles({ promotions, place, className = "" }: { promotions: Promotion[]; place: Place; className?: string }) {
  const { isAdmin, picked, pick } = useChart();
  return (
    <section className={`space-y-2 text-left ${className}`} aria-label="Promotions up for grabs">
      <h2 className="group-title">Promotions up for grabs</h2>
      {promotions.length > 0 || isAdmin ? (
        <ul className="flex flex-wrap items-center gap-1.5">
          {promotions.map((p) => (
            <li key={p.key} className="max-w-full">
              {isAdmin ? <DraggableRole promotion={p} place={place} /> : <RoleChip label={p.label} />}
            </li>
          ))}
          {isAdmin && <NewPromotion place={place} />}
        </ul>
      ) : (
        <p className="text-sm text-muted">Every promotion is taken.</p>
      )}
      {isAdmin && promotions.length > 0 && (
        picked ? (
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>Now press <span className="font-medium text-fg">Give</span> on someone&apos;s card.</span>
            <button type="button" onClick={() => pick(null)} className="font-medium text-accent-strong hover:underline">
              Cancel
            </button>
          </p>
        ) : (
          <p className="text-xs text-muted">Drag one onto a person to promote them, or tap it to pick who.</p>
        )
      )}
    </section>
  );
}

// Admins type a new promotion straight onto the board.
function NewPromotion({ place }: { place: Place }) {
  const { add } = useChart();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const id = `new-promotion-${place}`;

  function close() {
    setOpen(false);
    setError("");
  }

  if (!open) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-control border border-dashed border-accent/60 px-2 py-0.5 text-xs text-accent-strong transition-colors duration-150 hover:border-accent hover:bg-accent/[0.08]"
        >
          <Plus aria-hidden="true" className="size-3" />
          New promotion
        </button>
      </li>
    );
  }

  return (
    <li className="basis-full">
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const problem = add(input.current?.value ?? "");
          if (problem) {
            setError(problem);
            input.current?.focus();
          } else {
            close();
          }
        }}
      >
        <label htmlFor={id} className="sr-only">New promotion</label>
        <input
          ref={input}
          id={id}
          autoFocus
          maxLength={60}
          autoComplete="off"
          placeholder="e.g. Head of Marketing"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={() => setError("")}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          className="input min-h-8 min-w-0 flex-1 px-2 text-xs sm:min-h-8 sm:text-xs"
        />
        <button type="submit" className="btn btn-primary min-h-8 px-3 text-xs">Add</button>
        <button
          type="button"
          onClick={close}
          aria-label="Cancel"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-muted hover:bg-fg/[0.08] hover:text-fg"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </form>
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </li>
  );
}

function RoleChip({ label, lifted, active }: { label: string; lifted?: boolean; active?: boolean }) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-control border px-2 py-0.5 text-xs ${
        lifted
          ? "cursor-grabbing border-accent bg-surface-2 shadow-float"
          : active
            ? "border-accent bg-accent/[0.12]"
            : "border-dashed border-line-strong"
      }`}
    >
      <span className="truncate" title={label}>{label}</span>
    </span>
  );
}

function DraggableRole({ promotion, place }: { promotion: Promotion; place: Place }) {
  const { picked, pick, dragging, remove } = useChart();
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `${place}:${promotion.key}`,
    data: { promotion },
  });
  const isPicked = picked?.key === promotion.key;
  // Title promotions can come off the board; venture lead seats come and go
  // with their venture.
  const removable = promotion.removableId !== null;
  const saving = promotion.removableId?.startsWith(UNSAVED) ?? false;
  return (
    <span className={`inline-flex max-w-full items-center ${dragging?.key === promotion.key ? "opacity-40" : ""}`}>
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-pressed={isPicked}
        aria-label={`${promotion.label}. Drag onto a person, or press to pick who gets it`}
        onClick={() => pick(isPicked ? null : promotion)}
        className="block max-w-full min-w-0 cursor-grab touch-manipulation select-none [-webkit-touch-callout:none]"
      >
        <RoleChip label={promotion.label} active={isPicked} />
      </button>
      {removable && (
        <button
          type="button"
          onClick={() => remove(promotion)}
          disabled={saving}
          aria-label={`Take ${promotion.label} off the board`}
          title={`Take ${promotion.label} off the board`}
          className="ml-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-control text-faint transition-colors duration-150 hover:bg-fg/[0.08] hover:text-fg disabled:opacity-40"
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      )}
    </span>
  );
}

function ChartBranch({ node }: { node: Node }) {
  // A row of people with no one under them can wrap when space runs out.
  const leaves = node.reports.length > 1 && node.reports.every((r) => !r.reports.length);
  return (
    <>
      <PersonCard node={node} place="desktop" />
      {node.reports.length > 0 && (
        <ul className={leaves ? "org-children org-leaves" : "org-children"}>
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
      <PersonCard node={node} size="wide" place="phone" />
      {node.reports.length > 0 && (
        <ul className="ml-3 space-y-3 border-l border-line-strong pl-3">
          {node.reports.map((r) => <OutlineItem key={r.person.id} node={r} />)}
        </ul>
      )}
    </li>
  );
}

// "fit" grows and shrinks with the chart, "fixed" sits in a wrapping row,
// "wide" fills the phone outline.
const CARD_WIDTH = { fit: "w-full max-w-56 min-w-28", fixed: "w-56", wide: "w-full" };

function PersonCard({ node, size = "fit", place }: { node: Node; size?: keyof typeof CARD_WIDTH; place: Place }) {
  const { isAdmin, seats, dragging, picked, give, take } = useChart();
  const p = node.person;
  const { setNodeRef, isOver } = useDroppable({ id: `${place}:${p.id}`, data: { personId: p.id }, disabled: !isAdmin });

  const title = seats.people.find((x) => x.id === p.id)?.title ?? null;
  const led = venturesLed(seats.ventures, p.id);
  const reports = node.size - 1;
  const role = p.role === "admin" ? "Admin" : "Team member";
  const facts = [
    `${p.openTasks} open task${p.openTasks === 1 ? "" : "s"}`,
    reports ? `${reports} under them` : null,
  ].filter(Boolean);

  // While a promotion is being dragged, show which cards can take it.
  const fits = dragging ? canGive(seats, p.id, dragging.seat).ok : false;
  const ring = isOver
    ? fits
      ? "border-accent bg-accent/[0.1] shadow-[inset_0_0_0_1px_var(--color-accent)]"
      : "border-danger/60 bg-danger/[0.06]"
    : dragging && fits
      ? "border-dashed border-accent/70"
      : p.isMe
        ? "border-accent shadow-[inset_0_0_0_1px_var(--color-accent)]"
        : "border-line";

  return (
    <article
      ref={setNodeRef}
      className={`space-y-2 rounded-card border bg-surface-2 p-3 text-left text-sm transition-colors duration-150 ${CARD_WIDTH[size]} ${ring}`}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold break-words">
            {p.name}
            {p.isMe && <span className="ml-1.5 text-xs font-medium text-accent-strong">You</span>}
          </p>
          <p className="flex items-start gap-1 break-words text-label text-muted">
            <span className="min-w-0">{title ?? role}</span>
            {isAdmin && title && (
              <RemoveButton label={`Remove ${p.name}'s title, ${title}`} onClick={() => take(p.id, { kind: "title", title })} />
            )}
          </p>
        </div>
      </div>
      {led.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`What ${p.name} leads`}>
          {led.map((v) => {
            const label = `${v.name} Lead`;
            return (
              <li
                key={v.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-control bg-fg/[0.06] py-0.5 pr-1 pl-2 text-xs"
                title={`${label} · ${STATUS_LABEL[v.status]}`}
              >
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${v.status === "idea" ? "border-[1.5px] bg-surface" : ""}`}
                  style={v.status === "idea" ? { borderColor: STATUS_COLOR[v.status] } : { background: STATUS_COLOR[v.status] }}
                />
                <span className="truncate">{label}</span>
                {isAdmin && (
                  <RemoveButton
                    label={`Remove ${p.name} as ${label}`}
                    onClick={() => take(p.id, { kind: "lead", ventureId: v.id })}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">{facts.join(" · ")}</p>
      {picked && (
        <button
          type="button"
          onClick={() => give(p.id, picked.seat)}
          className="btn btn-secondary min-h-9 w-full text-xs"
        >
          Give {picked.label}
        </button>
      )}
    </article>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="-my-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-control text-faint transition-colors duration-150 hover:bg-fg/[0.08] hover:text-fg"
    >
      <X aria-hidden="true" className="size-3" />
    </button>
  );
}
