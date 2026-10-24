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
import { X } from "lucide-react";
import Link from "next/link";
import { createContext, use, useMemo, useOptimistic, useState, useTransition } from "react";
import { buildOrgTree, type OrgNode, type OrgPerson } from "@/lib/hierarchy";
import {
  canGive,
  giveSeat as giveLocal,
  openPromotions,
  seatLabel,
  seatsHeld,
  takeSeat as takeLocal,
  type Promotion,
  type Seat,
  type SeatPerson,
  type Seats,
} from "@/lib/promotions";
import { STATUS_COLOR, STATUS_LABEL, type VentureStatus } from "@/lib/ventures";
import { FitChart } from "./fit-chart";
import { giveSeat, takeSeat } from "./team-actions";

export type ChartPerson = OrgPerson & {
  color: string;
  isMe: boolean;
  openTasks: number;
};

// A venture's lead and co-lead seats, the same ones the Ventures map shows.
export type ChartVenture = {
  id: string;
  name: string;
  status: VentureStatus;
  leadId: string | null;
  coLeadIds: string[];
};

type Node = OrgNode<ChartPerson>;
type ChartSeats = Seats<ChartVenture, SeatPerson>;
type Change = { give: boolean; personId: string; seat: Seat };
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
};
const ChartContext = createContext<Chart | null>(null);
const useChart = () => use(ChartContext)!;

// The team's org chart, for everyone. Admins set titles and who reports to
// whom on Admin → Team, and hand out promotions here: drag one onto a person
// (or tap it, then tap "Give" on their card). A venture's lead and co-lead
// seats are the ones on the Ventures map, so the two always match.
// Computers get a top-down chart; phones an outline.
export function TeamChart({
  people,
  ventures,
  isAdmin,
}: {
  people: ChartPerson[];
  ventures: ChartVenture[];
  isAdmin: boolean;
}) {
  const base = useMemo<ChartSeats>(
    () => ({ ventures, people: people.map((p) => ({ id: p.id, title: p.title })) }),
    [ventures, people],
  );
  const [seats, apply] = useOptimistic(base, (state, c: Change) =>
    c.give ? giveLocal(state, c.personId, c.seat) : takeLocal(state, c.personId, c.seat),
  );
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
        const res = await (c.give ? giveSeat : takeSeat)(c.personId, c.seat);
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
    const wasCoLead = seat.kind === "lead" && seats.ventures.some((v) => v.id === seat.ventureId && v.coLeadIds.includes(personId));
    // Undo puts back exactly what was there before.
    const undo: Change[] =
      seat.kind === "title"
        ? [before ? { give: true, personId, seat: { kind: "title", title: before } } : { give: false, personId, seat }]
        : [
            { give: false, personId, seat },
            ...(wasCoLead ? [{ give: true, personId, seat: { kind: "co_lead", ventureId: seat.ventureId } } as Change] : []),
          ];
    run([{ give: true, personId, seat }], {
      tone: "success",
      text: `${name} is now ${label}${before ? ` (was ${before})` : ""}.`,
      undo: () => run(undo, { tone: "success", text: "Undone." }),
    });
  }

  function take(personId: string, seat: Seat) {
    const label = seat.kind === "title" ? seat.title : seatLabel(seat, seats.ventures);
    run([{ give: false, personId, seat }], {
      tone: "success",
      text: `${nameOf(personId)} is no longer ${label}.`,
      undo: () => run([{ give: true, personId, seat }], { tone: "success", text: "Undone." }),
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

  const chart: Chart = { isAdmin, seats, dragging, picked, pick: setPicked, give, take };

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
      {promotions.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {promotions.map((p) => (
            <li key={p.key} className="max-w-full">
              {isAdmin ? <DraggableRole promotion={p} place={place} /> : <RoleChip label={p.label} />}
            </li>
          ))}
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
  const { picked, pick, dragging } = useChart();
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `${place}:${promotion.key}`,
    data: { promotion },
  });
  const isPicked = picked?.key === promotion.key;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-pressed={isPicked}
      aria-label={`${promotion.label}. Drag onto a person, or press to pick who gets it`}
      onClick={() => pick(isPicked ? null : promotion)}
      className={`block max-w-full cursor-grab touch-manipulation select-none [-webkit-touch-callout:none] ${
        dragging?.key === promotion.key ? "opacity-40" : ""
      }`}
    >
      <RoleChip label={promotion.label} active={isPicked} />
    </button>
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
  const held = seatsHeld(seats.ventures, p.id);
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
      {held.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`What ${p.name} leads`}>
          {held.map(({ venture: v, role: seatRole }) => {
            const label = `${v.name} ${seatRole === "lead" ? "Lead" : "Co-Lead"}`;
            return (
              <li
                key={`${seatRole}:${v.id}`}
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
                    onClick={() => take(p.id, { kind: seatRole, ventureId: v.id })}
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
