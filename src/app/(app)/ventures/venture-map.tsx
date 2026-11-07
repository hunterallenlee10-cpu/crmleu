"use client";

import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { followUpLabel } from "@/lib/dates";
import {
  BANDS,
  BAND_WIDTH,
  LABEL_SIZES,
  MAP,
  VIEWBOX,
  bandStart,
  dueBand,
  labelPlacement,
  layoutDots,
  polar,
  shortLabel,
  spokeAngle,
} from "@/lib/venture-map";
import { STATUS_COLOR, STATUS_LABEL, VENTURE_STATUSES } from "@/lib/ventures";
import { setTaskDone } from "../tasks/actions";
import { DueLabel, ProgressBar, StatusPill, Timeline, hasTimeline } from "./bits";
import { QuickAddTask, VentureForm, type Person, type VentureDetails } from "./venture-forms";

export type MapVenture = VentureDetails & { leadColor: string };
export type MapTask = {
  id: string;
  title: string;
  details: string | null;
  ventureId: string;
  assigneeId: string | null; // null = whole team
  assignee: string;
  color: string;
  dueDate: string | null;
  done: boolean;
  everyone: boolean; // each rep ticks it off for themselves, on the Tasks page
  canCheck: boolean;
};

type Selection =
  | { mode: "overview" }
  | { mode: "venture"; id: string; editing?: boolean }
  | { mode: "task"; id: string };

type Bubble = { id: string; left: number; top: number; width: number; above: boolean };

const BUBBLE_WIDTH = 304;
// Below Tailwind's md breakpoint the map draws its bigger phone labels.
const PHONE_QUERY = "(max-width: 767px)";
const tally = (tasks: MapTask[]) => ({ done: tasks.filter((t) => t.done).length, total: tasks.length });

const listNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "");

// "Run by Ann with Bob and Cat", for the overview list.
function runByLine(v: MapVenture) {
  const co = listNames(v.coLeads.map((c) => c.name));
  if (v.lead) return `Run by ${v.lead}${co ? ` with ${co}` : ""}`;
  return co ? `Co-led by ${co}` : "No one running it yet";
}

// The lead, then any co-leads, each with their colour. Rows of a <dl>.
function RunBy({ venture, className = "" }: { venture: MapVenture; className?: string }) {
  const dot = (color: string) => <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: color }} />;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <dt className="text-xs text-muted">Lead</dt>
        <dd className={`flex min-w-0 items-center gap-1.5 font-medium ${className}`}>
          {venture.lead ? (
            <>
              {dot(venture.leadColor)}
              <span className="truncate">{venture.lead}</span>
            </>
          ) : (
            <span className="font-normal text-faint">No one yet</span>
          )}
        </dd>
      </div>
      {venture.coLeads.length > 0 && (
        <div className="flex items-start justify-between gap-3">
          <dt className="text-xs text-muted">Co-leads</dt>
          <dd className={`flex min-w-0 flex-wrap justify-end gap-x-3 gap-y-1 font-medium ${className}`}>
            {venture.coLeads.map((c) => (
              <span key={c.id} className="flex min-w-0 items-center gap-1.5">
                {dot(c.color)}
                <span className="truncate">{c.name}</span>
              </span>
            ))}
          </dd>
        </div>
      )}
    </>
  );
}

// The Ventures map: each venture is a branch around LEU and every task on it
// is a dot. Dots sit closer to the core the sooner they're due, and finished
// tasks join the core. Hovering a venture's name opens a bubble with what it
// is, its lead and co-leads, its timeline and its tasks. The side panel shows an
// overview, one venture (editable by admins) or one task.
export function VentureMap({
  ventures,
  tasks,
  people,
  person,
  isAdmin,
  today,
}: {
  ventures: MapVenture[];
  tasks: MapTask[];
  people: Person[]; // active team members, for assigning
  person: string; // "" = everyone, "team", or a profile id
  isAdmin: boolean;
  today: string;
}) {
  const [items, applyTick] = useOptimistic(tasks, (state, tick: { id: string; done: boolean }) =>
    state.map((t) => (t.id === tick.id ? { ...t, done: tick.done } : t)),
  );
  const [, startTransition] = useTransition();
  const [sel, setSel] = useState<Selection>({ mode: "overview" });
  const [picks, setPicks] = useState(0); // remounts the venture panel on each pick
  const [error, setError] = useState("");
  const [pulse, setPulse] = useState(0);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = closeTimer;
    return () => window.clearTimeout(timer.current);
  }, []);

  const matches = (t: MapTask) => !person || (person === "team" ? !t.assigneeId : t.assigneeId === person);
  const spokeIndex = useMemo(() => new Map(ventures.map((v, i) => [v.id, i])), [ventures]);
  const { positions, overflow } = useMemo(
    () =>
      layoutDots(
        ventures.length,
        items.map((t) => ({ id: t.id, spoke: spokeIndex.get(t.ventureId) ?? -1, due: t.dueDate, done: t.done })),
        today,
      ),
    [items, ventures.length, spokeIndex, today],
  );

  const ventureById = (id: string) => ventures.find((v) => v.id === id);
  const tasksOf = (id: string) => items.filter((t) => t.ventureId === id && matches(t));
  // A selected task or venture can disappear after a refresh (deleted, moved).
  const selectedTask = sel.mode === "task" ? items.find((t) => t.id === sel.id) : undefined;
  const selectedVenture = sel.mode === "venture" ? sel.id : selectedTask?.ventureId;

  function select(next: Selection) {
    setError("");
    setBubble(null);
    setSel(next);
    setPicks((n) => n + 1);
    // Below the wide layout the panel sits under the map, so bring it into view.
    if (next.mode !== "overview" && window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function tick(task: MapTask, done: boolean) {
    setError("");
    if (done) setPulse((n) => n + 1);
    startTransition(async () => {
      applyTick({ id: task.id, done });
      const res = await setTaskDone(task.id, done);
      if (res.error) setError(res.error);
    });
  }

  function showTip(id: string, el: Element) {
    const stage = stageRef.current?.getBoundingClientRect();
    const dot = el.getBoundingClientRect();
    if (!stage) return;
    setBubble(null);
    const x = Math.min(Math.max(dot.left + dot.width / 2 - stage.left, 130), stage.width - 130);
    setTip({ id, x, y: dot.top - stage.top });
  }

  // The bubble opens beside the venture's name, on the side facing the core.
  function openBubble(index: number, id: string) {
    window.clearTimeout(closeTimer.current);
    const stage = stageRef.current?.getBoundingClientRect();
    const svg = svgRef.current?.getBoundingClientRect();
    if (!stage || !svg) return;
    const scale = svg.width / VIEWBOX.width;
    const angle = spokeAngle(index, ventures.length);
    const label = labelPlacement(angle, window.matchMedia(PHONE_QUERY).matches);
    const x = svg.left - stage.left + (label.x - VIEWBOX.x) * scale;
    const y = svg.top - stage.top + (label.y - VIEWBOX.y) * scale;
    const width = Math.min(BUBBLE_WIDTH, stage.width - 16);
    const left = label.anchor === "start" ? x - 24 : label.anchor === "end" ? x - width + 24 : x - width / 2;
    const above = Math.sin(angle) >= 0;
    const middle = label.anchor === "middle";
    const top = above ? y - (middle ? 4 : 26) * scale - 6 : y + (middle ? 6 : 24) * scale + 6;
    setTip(null);
    setBubble({ id, left: Math.min(Math.max(left, 8), stage.width - width - 8), top, width, above });
  }
  function closeBubbleSoon() {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setBubble(null), 220);
  }
  function keepBubble() {
    window.clearTimeout(closeTimer.current);
  }

  const visible = items.filter(matches);
  const ringLabelAngle = spokeAngle(0.5, ventures.length || 1);
  const tipTask = tip ? items.find((t) => t.id === tip.id) : undefined;
  const bubbleVenture = bubble ? ventureById(bubble.id) : undefined;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div ref={stageRef} className="relative rounded-card border border-line bg-surface">
        <svg
          ref={svgRef}
          viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`}
          className="block h-auto w-full select-none"
          role="group"
          aria-label="Ventures map: LEU's ventures and their tasks"
        >
          <defs>
            <radialGradient id="leu-core-glow">
              <stop offset="0%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.22 }} />
              <stop offset="100%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0 }} />
            </radialGradient>
          </defs>

          {/* Rings by due date: due now by the core, no date at the tips */}
          <g aria-hidden="true">
            {BANDS.map((name, b) => (
              <g key={name}>
                {b > 0 && <circle r={bandStart(b)} className="fill-none stroke-line" strokeWidth={1} />}
                {ventures.length > 1 && (
                  <text
                    {...polar(bandStart(b) + BAND_WIDTH / 2, ringLabelAngle)}
                    dy={4}
                    textAnchor="middle"
                    className="fill-faint text-[13px] font-medium max-md:text-[22px]"
                  >
                    {name}
                  </text>
                )}
              </g>
            ))}
          </g>

          {ventures.map((v, i) => {
            const a = spokeAngle(i, ventures.length);
            const here = tasksOf(v.id);
            const open = here.filter((t) => !t.done).length;
            const strength = Math.min(open, 6);
            const isSel = selectedVenture === v.id;
            const lit = isSel || bubble?.id === v.id;
            const leadFirst = v.lead?.split(" ")[0];
            const countText = `${open ? `${open} open` : here.length ? "all done" : "no tasks"}${leadFirst ? ` · ${shortLabel(leadFirst, 10)}` : ""}`;
            const status = STATUS_LABEL[v.status];
            const statusColor = STATUS_COLOR[v.status];
            // Computers and phones get the same label, sized for each screen.
            // Computers also spell out the status; phones rely on the beacon.
            const labels = (["desktop", "phone"] as const).map((size) => {
              const sz = LABEL_SIZES[size];
              const place = labelPlacement(a, size === "phone");
              const shown = shortLabel(v.name, sz.maxChars);
              const withStatus = size === "desktop";
              const countLen = countText.length + (withStatus ? status.length + 3 : 0);
              const nameW = shown.length * sz.name * 0.57;
              // The status beacon sits beside the name, on the side facing the core.
              const gap = Math.round(sz.name * 0.6);
              const beacon = {
                x: Math.round(place.anchor === "start" ? place.x - gap : place.anchor === "end" ? place.x + gap : place.x - nameW / 2 - gap),
                y: Math.round(place.nameY - sz.name * 0.34),
                r: Math.round(sz.name * 0.24),
              };
              // A rough box around the name so hovering anywhere on it opens the bubble.
              const boxW = Math.max(nameW, countLen * sz.count * 0.53) + 16 + gap;
              const boxX = Math.round(
                place.anchor === "start" ? place.x - 8 - gap : place.anchor === "end" ? place.x - boxW + 8 + gap : place.x - boxW / 2 - gap / 2,
              );
              return { size, sz, place, shown, boxW, boxX, beacon, withStatus };
            });
            const { x: x1, y: y1 } = polar(MAP.coreRadius + 4, a);
            const { x: x2, y: y2 } = polar(MAP.outerRadius, a);
            const plus = polar(MAP.plusRadius, a);
            return (
              <g key={v.id} className="group">
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={`${v.name}, ${status}: ${countText}. Open details`}
                  className="cursor-pointer outline-none"
                  onClick={() => select({ mode: "venture", id: v.id })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select({ mode: "venture", id: v.id }); }
                  }}
                  onFocus={() => openBubble(i, v.id)}
                  onBlur={closeBubbleSoon}
                >
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={24} className="max-md:[stroke-width:56px]" />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    strokeLinecap="round"
                    strokeWidth={open ? 1.6 + strength * 0.9 : 1.4}
                    strokeDasharray={here.length ? undefined : "3 8"}
                    strokeOpacity={lit ? 1 : open ? 0.3 + strength * 0.08 : 0.8}
                    className={`transition-[stroke,stroke-width,stroke-opacity] duration-300 group-hover:stroke-accent-strong group-hover:[stroke-opacity:1] group-focus-within:stroke-accent-strong ${
                      lit ? "stroke-accent-strong" : open ? "stroke-accent" : "stroke-faint"
                    }`}
                  />
                  {labels.map(({ size, sz, place, shown, boxW, boxX, beacon, withStatus }) => (
                    <g
                      key={size}
                      className={size === "phone" ? "md:hidden" : "max-md:hidden"}
                      onPointerEnter={() => openBubble(i, v.id)}
                      onPointerLeave={closeBubbleSoon}
                    >
                      <rect
                        x={boxX}
                        y={place.nameY - sz.name}
                        width={boxW}
                        height={place.countY - place.nameY + sz.name + 8}
                        rx={8}
                        className={`fill-fg transition-opacity ${lit ? "opacity-[0.06]" : "opacity-0 group-hover:opacity-[0.04]"}`}
                      />
                      <text
                        x={place.x}
                        y={place.nameY}
                        textAnchor={place.anchor}
                        style={{ fontSize: sz.name }}
                        className={`font-semibold transition-colors group-hover:fill-accent-strong group-focus-within:fill-accent-strong ${
                          lit ? "fill-accent-strong" : here.length ? "fill-fg" : "fill-muted"
                        }`}
                      >
                        {shown}
                      </text>
                      <g aria-hidden="true">
                        {v.status === "live" && (
                          <circle
                            cx={beacon.x}
                            cy={beacon.y}
                            r={beacon.r}
                            style={{ fill: statusColor }}
                            className="origin-center [transform-box:fill-box] motion-safe:animate-beacon-ping"
                          />
                        )}
                        <circle
                          cx={beacon.x}
                          cy={beacon.y}
                          r={beacon.r}
                          style={v.status === "idea" ? { stroke: statusColor } : { fill: statusColor }}
                          className={v.status === "idea" ? "fill-surface" : undefined}
                          strokeWidth={v.status === "idea" ? Math.max(2, beacon.r * 0.4) : undefined}
                        >
                          <title>{status}</title>
                        </circle>
                      </g>
                      <text x={place.x} y={place.countY} textAnchor={place.anchor} style={{ fontSize: sz.count }} className="fill-muted">
                        {withStatus && (
                          <>
                            <tspan style={{ fill: statusColor }} className="font-semibold">{status}</tspan>
                            {" · "}
                          </>
                        )}
                        {countText}
                      </text>
                    </g>
                  ))}
                </g>
                {isAdmin && (
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`Add a task to ${v.name}`}
                    transform={`translate(${plus.x} ${plus.y})`}
                    className="cursor-pointer opacity-0 outline-none transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                    onClick={() => select({ mode: "venture", id: v.id })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select({ mode: "venture", id: v.id }); }
                    }}
                  >
                    <title>{`Add a task to ${v.name}`}</title>
                    <circle r={12} className="fill-surface stroke-accent-strong" strokeWidth={1.5} />
                    <path d="M-5 0H5M0-5V5" className="stroke-accent-strong" strokeWidth={1.8} strokeLinecap="round" />
                  </g>
                )}
              </g>
            );
          })}

          <g
            role="button"
            tabIndex={0}
            aria-label="LEU overview"
            className="cursor-pointer outline-none"
            onClick={() => select({ mode: "overview" })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select({ mode: "overview" }); }
            }}
          >
            <circle r={150} fill="url(#leu-core-glow)" />
            {pulse > 0 && (
              <circle key={pulse} r={MAP.coreRadius} className="animate-core-pulse fill-none stroke-accent-strong" strokeWidth={2} />
            )}
            {/* The LEU logo, floating. Silver on dark, gold on light (see .logo-dark / .logo-light). */}
            <circle r={MAP.coreRadius} fill="transparent" />
            <g className="motion-safe:animate-leu-float">
              <image
                href="/brand/leu-logo-silver.webp"
                x={-58}
                y={-46}
                width={116}
                height={113}
                className="logo-dark drop-shadow-[0_10px_14px_rgb(0_0_0_/_0.55)]"
              />
              <image
                href="/brand/leu-logo-gold.webp"
                x={-58}
                y={-46}
                width={116}
                height={109}
                className="logo-light drop-shadow-[0_10px_14px_rgb(15_27_45_/_0.25)]"
              />
            </g>
          </g>

          <g>
            {items.map((t) => {
              const pos = positions.get(t.id);
              if (!pos) return null;
              const isSel = sel.mode === "task" && sel.id === t.id;
              const dim = !matches(t);
              const overdue = !t.done && t.dueDate !== null && t.dueDate < today;
              return (
                <g
                  key={t.id}
                  role="button"
                  tabIndex={dim ? -1 : 0}
                  aria-label={`${t.title}, ${t.assignee}, ${t.done ? "done" : t.dueDate ? followUpLabel(t.dueDate, today).text : "no due date"}`}
                  style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
                  className={`group/dot cursor-pointer outline-none transition-[transform,opacity] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] ${dim ? "opacity-15" : ""}`}
                  onClick={() => select({ mode: "task", id: t.id })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select({ mode: "task", id: t.id }); }
                  }}
                  onPointerEnter={(e) => showTip(t.id, e.currentTarget)}
                  onPointerLeave={() => setTip(null)}
                  onFocus={(e) => showTip(t.id, e.currentTarget)}
                  onBlur={() => setTip(null)}
                >
                  {/* A little bigger on phones, where the whole map is shrunk. */}
                  <g className="origin-center [transform-box:fill-box] max-md:scale-125">
                    <circle r={11} fill="transparent" />
                    <circle
                      r={12}
                      className={`fill-none transition-opacity group-hover/dot:opacity-90 group-focus-visible/dot:opacity-90 ${
                        overdue ? "stroke-danger opacity-80" : "stroke-fg"
                      } ${isSel ? "opacity-90" : overdue ? "" : "opacity-0"}`}
                      strokeWidth={1.5}
                    />
                    <circle
                      r={MAP.dotRadius}
                      style={{ fill: t.color }}
                      className="stroke-surface"
                      strokeWidth={2}
                    />
                  </g>
                </g>
              );
            })}
            {overflow.map((o) => {
              const v = ventures[o.spoke];
              return (
                <g
                  key={o.key}
                  role="button"
                  tabIndex={0}
                  aria-label={`${o.count} more ${BANDS[o.band].toLowerCase()} in ${v.name}`}
                  transform={`translate(${o.x} ${o.y})`}
                  className="cursor-pointer outline-none"
                  onClick={() => select({ mode: "venture", id: v.id })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select({ mode: "venture", id: v.id }); }
                  }}
                >
                  <title>{`${o.count} more`}</title>
                  <circle r={10} className="fill-surface-2 stroke-line-strong" strokeWidth={1} />
                  <text y={3.5} textAnchor="middle" className="fill-muted text-[10px] font-semibold">
                    +{o.count}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {tip && tipTask && (
          <div
            className="pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-control border border-line bg-surface-2 px-3 py-2 text-sm shadow-float"
            style={{ left: tip.x, top: tip.y }}
          >
            <p className="font-medium break-words">{tipTask.title}</p>
            <p className="text-xs text-muted">
              {tipTask.assignee} · {ventureById(tipTask.ventureId)?.name}
            </p>
            <p className="mt-1">
              <DueLabel date={tipTask.dueDate} today={today} done={tipTask.done} />
            </p>
          </div>
        )}

        {bubble && bubbleVenture && (
          <VentureBubble
            venture={bubbleVenture}
            tasks={tasksOf(bubbleVenture.id)}
            isAdmin={isAdmin}
            today={today}
            style={{
              left: bubble.left,
              top: bubble.top,
              width: bubble.width,
              transform: bubble.above ? "translateY(-100%)" : undefined,
            }}
            onEnter={keepBubble}
            onLeave={closeBubbleSoon}
            onOpen={(editing) => select({ mode: "venture", id: bubbleVenture.id, editing })}
            onPickTask={(id) => select({ mode: "task", id })}
          />
        )}

        <p className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-5 py-3 text-xs text-muted">
          <span className="flex w-full flex-wrap items-center gap-x-4 gap-y-1">
            {VENTURE_STATUSES.map((st) => (
              <span key={st} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`size-2.5 rounded-full ${st === "idea" ? "border-2 bg-surface" : ""}`}
                  style={st === "idea" ? { borderColor: STATUS_COLOR[st] } : { background: STATUS_COLOR[st] }}
                />
                {STATUS_LABEL[st]}
              </span>
            ))}
          </span>
          <span className="max-md:hidden">Each branch is a venture. Hover its name for the details.</span>
          <span className="md:hidden">Each branch is a venture. Tap it for the details.</span>
          <span>Dots are tasks: the sooner they&apos;re due, the closer to LEU. Done tasks join the core.</span>
          {isAdmin && <span className="max-md:hidden">Press + on a branch to add a task.</span>}
          {isAdmin && <span className="md:hidden">Tap a branch to add a task to it.</span>}
        </p>
      </div>

      <aside
        ref={panelRef}
        className="card space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
        aria-live="polite"
      >
        {sel.mode === "task" && selectedTask ? (
          <TaskPanel
            task={selectedTask}
            venture={ventureById(selectedTask.ventureId)}
            today={today}
            error={error}
            onBack={() => select({ mode: "venture", id: selectedTask.ventureId })}
            onTick={(done) => tick(selectedTask, done)}
          />
        ) : sel.mode === "venture" && ventureById(sel.id) ? (
          <VenturePanel
            key={`${sel.id}-${picks}`}
            venture={ventureById(sel.id)!}
            tasks={tasksOf(sel.id)}
            people={people}
            isAdmin={isAdmin}
            startEditing={Boolean(sel.editing)}
            today={today}
            error={error}
            onBack={() => select({ mode: "overview" })}
            onPick={(id) => select({ mode: "task", id })}
            onTick={tick}
          />
        ) : (
          <OverviewPanel
            ventures={ventures}
            tasks={visible}
            isAdmin={isAdmin}
            filtered={Boolean(person)}
            today={today}
            onPickVenture={(id) => select({ mode: "venture", id })}
            onPickTask={(id) => select({ mode: "task", id })}
          />
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The hover bubble
// ---------------------------------------------------------------------------

function VentureBubble({
  venture,
  tasks,
  isAdmin,
  today,
  style,
  onEnter,
  onLeave,
  onOpen,
  onPickTask,
}: {
  venture: MapVenture;
  tasks: MapTask[];
  isAdmin: boolean;
  today: string;
  style: React.CSSProperties;
  onEnter: () => void;
  onLeave: () => void;
  onOpen: (editing: boolean) => void;
  onPickTask: (id: string) => void;
}) {
  const { done, total } = tally(tasks);
  const open = tasks.filter((t) => !t.done).sort(byDue);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;
  const empty =
    !venture.description && !venture.leadId && !venture.coLeads.length && !venture.startDate && !venture.targetDate;
  return (
    <div
      role="dialog"
      aria-label={venture.name}
      className="absolute z-20 space-y-3 rounded-card border border-line bg-surface-2 p-4 text-sm shadow-float"
      style={style}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold break-words">{venture.name}</p>
        <StatusPill status={venture.status} />
      </div>

      {venture.description ? (
        <p className="line-clamp-4 whitespace-pre-line break-words text-muted">{venture.description}</p>
      ) : isAdmin ? (
        <button type="button" onClick={() => onOpen(true)} className="text-left text-accent-strong hover:underline">
          + Add what this venture is
        </button>
      ) : (
        <p className="text-faint">No description yet.</p>
      )}

      <dl className="space-y-2.5 border-t border-line pt-3">
        <RunBy venture={venture} />
        {hasTimeline(venture) && (
          <div className="space-y-1">
            <dt className="text-xs text-muted">Timeline</dt>
            <dd>
              <Timeline start={venture.startDate} target={venture.targetDate} today={today} />
            </dd>
          </div>
        )}
        <div className="space-y-1">
          <dt className="flex justify-between text-xs text-muted">
            <span>Tasks</span>
            {overdue > 0 && <span className="font-medium text-danger">{overdue} overdue</span>}
          </dt>
          <dd className="space-y-2">
            <ProgressBar done={done} total={total} />
            {open.length > 0 && (
              <ul className="space-y-1">
                {open.slice(0, 3).map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onPickTask(t.id)}
                      className="flex w-full items-start gap-2 rounded-control text-left hover:text-accent-strong"
                    >
                      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: t.color }} />
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <DueLabel date={t.dueDate} today={today} />
                    </button>
                  </li>
                ))}
                {open.length > 3 && <li className="text-xs text-muted">+ {open.length - 3} more</li>}
              </ul>
            )}
          </dd>
        </div>
      </dl>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => onOpen(false)} className="btn btn-secondary min-h-9 flex-1 text-label">
          Open
        </button>
        {isAdmin && (
          <button type="button" onClick={() => onOpen(true)} className="btn btn-primary min-h-9 flex-1 text-label">
            {empty ? "Fill in details" : "Edit"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side panel
// ---------------------------------------------------------------------------

function byDue(a: MapTask, b: MapTask) {
  return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.title.localeCompare(b.title);
}

function TaskLine({
  task,
  today,
  sub,
  onPick,
  onTick,
}: {
  task: MapTask;
  today: string;
  sub?: string;
  onPick: (id: string) => void;
  onTick?: (task: MapTask, done: boolean) => void;
}) {
  const canTick = Boolean(onTick) && task.canCheck;
  return (
    <li className="flex items-start gap-2.5 rounded-control px-2 py-2 hover:bg-surface-2">
      {onTick && (
        <input
          type="checkbox"
          checked={task.done}
          disabled={!canTick}
          onChange={(e) => onTick(task, e.target.checked)}
          aria-label={`${task.done ? "Mark not done" : "Mark done"}: ${task.title}`}
          title={canTick ? undefined : task.everyone ? "Each rep ticks this off on the Tasks page" : `Only ${task.assignee} can tick this off`}
          className="mt-0.5 size-[18px] shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        />
      )}
      <button type="button" onClick={() => onPick(task.id)} className="min-w-0 flex-1 text-left">
        <span className={`block break-words ${task.done ? "text-muted line-through" : "font-medium"}`}>{task.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: task.color }} />
            {sub ?? task.assignee}
          </span>
          {!task.done && <DueLabel date={task.dueDate} today={today} />}
        </span>
      </button>
    </li>
  );
}

function OverviewPanel({
  ventures,
  tasks,
  isAdmin,
  filtered,
  today,
  onPickVenture,
  onPickTask,
}: {
  ventures: MapVenture[];
  tasks: MapTask[];
  isAdmin: boolean;
  filtered: boolean;
  today: string;
  onPickVenture: (id: string) => void;
  onPickTask: (id: string) => void;
}) {
  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  const soon = open.filter((t) => dueBand(t.dueDate, today) <= 1).sort(byDue).slice(0, 6);
  const name = (id: string) => ventures.find((v) => v.id === id)?.name ?? "";

  if (!ventures.length) {
    return (
      <div className="space-y-3">
        <h2 className="section-title">Overview</h2>
        <p className="text-sm text-muted">There are no ventures yet, so the map is empty.</p>
        {isAdmin && <Link href="/ventures/manage" className="btn btn-secondary">Add ventures</Link>}
      </div>
    );
  }

  return (
    <>
      <div>
        <h2 className="section-title">Overview</h2>
        <p className="mt-0.5 text-sm text-muted">
          {filtered ? "Filtered by person" : "Everyone"} · {ventures.length} ventures
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Open tasks" value={open.length} />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "text-danger" : undefined} />
        <Stat label="Done" value={tasks.length - open.length} />
      </dl>

      <section className="space-y-1.5">
        <h3 className="group-title">
          Due this week <span className="font-normal text-muted">· and overdue</span>
        </h3>
        {soon.length ? (
          <ul className="-mx-2">
            {soon.map((t) => (
              <TaskLine key={t.id} task={t} today={today} sub={`${t.assignee} · ${name(t.ventureId)}`} onPick={onPickTask} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing due this week.</p>
        )}
      </section>

      <section className="space-y-1.5">
        <h3 className="group-title">Ventures</h3>
        <ul className="-mx-2">
          {ventures.map((v) => {
            const mine = tasks.filter((t) => t.ventureId === v.id);
            const { done, total } = tally(mine);
            return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => onPickVenture(v.id)}
                  className="block w-full space-y-1.5 rounded-control px-2 py-2 text-left hover:bg-surface-2"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{v.name}</span>
                    <StatusPill status={v.status} />
                  </span>
                  <span className="block text-xs text-muted">{runByLine(v)}</span>
                  <ProgressBar done={done} total={total} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function VenturePanel({
  venture,
  tasks,
  people,
  isAdmin,
  startEditing,
  today,
  error,
  onBack,
  onPick,
  onTick,
}: {
  venture: MapVenture;
  tasks: MapTask[];
  people: Person[];
  isAdmin: boolean;
  startEditing: boolean;
  today: string;
  error: string;
  onBack: () => void;
  onPick: (id: string) => void;
  onTick: (task: MapTask, done: boolean) => void;
}) {
  const [editing, setEditing] = useState(isAdmin && startEditing);
  const { done, total } = tally(tasks);
  const open = tasks.filter((t) => !t.done).sort(byDue);
  const finished = tasks.filter((t) => t.done);

  return (
    <>
      <BackButton onClick={onBack}>Overview</BackButton>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="section-title break-words">{venture.name}</h2>
          <StatusPill status={venture.status} />
        </div>
        {!editing &&
          (venture.description ? (
            <p className="whitespace-pre-line break-words text-sm text-muted">{venture.description}</p>
          ) : (
            <p className="text-sm text-faint">No description yet.</p>
          ))}
      </div>

      {editing ? (
        <VentureForm venture={venture} people={people} autoFocus onDone={() => setEditing(false)} />
      ) : (
        <>
          <dl className="space-y-3">
            <RunBy venture={venture} className="text-sm" />
            {hasTimeline(venture) && (
              <div className="space-y-1">
                <dt className="text-xs text-muted">Timeline</dt>
                <dd>
                  <Timeline start={venture.startDate} target={venture.targetDate} today={today} />
                </dd>
              </div>
            )}
            <div className="space-y-1">
              <dt className="text-xs text-muted">Progress</dt>
              <dd>
                <ProgressBar done={done} total={total} />
              </dd>
            </div>
          </dl>
          {isAdmin && (
            <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary w-full">
              Edit details
            </button>
          )}
        </>
      )}

      <section className="space-y-1.5">
        <h3 className="group-title">
          Tasks <span className="font-normal text-muted">· {open.length} open</span>
        </h3>
        {open.length ? (
          <ul className="-mx-2 max-h-[24rem] overflow-y-auto">
            {open.map((t) => (
              <TaskLine key={t.id} task={t} today={today} onPick={onPick} onTick={onTick} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{total ? "Every task is done." : "No tasks on this venture yet."}</p>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </section>

      {isAdmin && (
        <section className="space-y-2">
          <h3 className="group-title">Add a task</h3>
          <QuickAddTask ventureId={venture.id} people={people} />
        </section>
      )}

      {finished.length > 0 && (
        <details className="space-y-1.5">
          <summary className="cursor-pointer text-label text-muted hover:text-fg">Done ({finished.length})</summary>
          <ul className="-mx-2 mt-1.5">
            {finished.map((t) => (
              <TaskLine key={t.id} task={t} today={today} onPick={onPick} onTick={onTick} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function TaskPanel({
  task,
  venture,
  today,
  error,
  onBack,
  onTick,
}: {
  task: MapTask;
  venture?: MapVenture;
  today: string;
  error: string;
  onBack: () => void;
  onTick: (done: boolean) => void;
}) {
  return (
    <>
      <BackButton onClick={onBack}>{venture?.name ?? "Venture"}</BackButton>
      <div className="space-y-1.5">
        <h2 className="section-title break-words">{task.title}</h2>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: task.color }} />
            {task.assignee}
          </span>
          <span aria-hidden>·</span>
          <DueLabel date={task.dueDate} today={today} done={task.done} />
        </p>
      </div>
      {task.details && <p className="whitespace-pre-line break-words text-sm text-muted">{task.details}</p>}

      {task.everyone ? (
        <p className="text-sm text-muted">Every rep ticks this one off for themselves on the Tasks page.</p>
      ) : (
        <label
          className={`flex items-center gap-3 rounded-control border border-line px-3 py-2.5 ${
            task.canCheck ? "cursor-pointer hover:border-line-strong" : "cursor-not-allowed opacity-60"
          }`}
        >
          <input
            type="checkbox"
            checked={task.done}
            disabled={!task.canCheck}
            onChange={(e) => onTick(e.target.checked)}
            className="size-[18px] shrink-0"
          />
          <span className="text-sm font-medium">
            {task.done ? "Done" : task.canCheck ? "Mark as done" : `Only ${task.assignee} can tick this off`}
          </span>
        </label>
      )}
      {task.done && <p className="text-xs font-medium text-success">Done. It has joined the core.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <Link href="/tasks" className="btn btn-secondary w-full">
        Open the task list
      </Link>
    </>
  );
}

function BackButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="block text-sm text-muted hover:text-fg">
      ← {children}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex flex-col-reverse rounded-control border border-line bg-bg px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-lg font-semibold ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}
