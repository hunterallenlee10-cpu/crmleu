"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { DueBadge, ProgressBar } from "@/components/project-row";
import {
  MAP,
  VIEWBOX,
  fraction,
  labelPlacement,
  layoutDots,
  radiusFor,
  shortLabel,
  spokeAngle,
} from "@/lib/project-map";
import { setTaskDone } from "./actions";

export type MapSpoke = { id: string; name: string; isUnsorted?: boolean };
export type MapTask = { id: number; title: string; done: boolean };
export type MapProject = {
  id: string;
  name: string;
  spokeId: string;
  assigneeId: string | null;
  assignee: string;
  color: string;
  dueDate: string | null;
  tasks: MapTask[];
};

type Selection = { mode: "overview" } | { mode: "division"; id: string } | { mode: "project"; id: string };

const counts = (p: MapProject) => {
  const done = p.tasks.filter((t) => t.done).length;
  return { done, total: p.tasks.length, complete: p.tasks.length > 0 && done === p.tasks.length };
};

// The Projects map: divisions are spokes around LEU, every project is a dot
// that moves from the tip of its spoke toward the core as its checklist gets
// done. A side panel shows the overview, a division, or one project's
// checklist (which the assignee and admins can tick right here).
export function ProjectMap({
  spokes,
  projects,
  person,
  isAdmin,
  meId,
  today,
}: {
  spokes: MapSpoke[];
  projects: MapProject[];
  person: string; // "" = everyone, "unassigned", or a profile id
  isAdmin: boolean;
  meId: string;
  today: string;
}) {
  const router = useRouter();
  const [items, applyTick] = useOptimistic(projects, (state, tick: { taskId: number; done: boolean }) =>
    state.map((p) =>
      p.tasks.some((t) => t.id === tick.taskId)
        ? { ...p, tasks: p.tasks.map((t) => (t.id === tick.taskId ? { ...t, done: tick.done } : t)) }
        : p,
    ),
  );
  const [, startTransition] = useTransition();
  const [sel, setSel] = useState<Selection>({ mode: "overview" });
  const [error, setError] = useState("");
  const [pulse, setPulse] = useState(0);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const matches = (p: MapProject) =>
    !person || (person === "unassigned" ? !p.assigneeId : p.assigneeId === person);
  const spokeIndex = useMemo(() => new Map(spokes.map((s, i) => [s.id, i])), [spokes]);
  const positions = useMemo(
    () =>
      layoutDots(
        spokes.length,
        items.map((p) => ({ id: p.id, spoke: spokeIndex.get(p.spokeId) ?? -1, ...counts(p) })),
      ),
    [items, spokes.length, spokeIndex],
  );

  // A selected project or division can disappear after a refresh (deleted, moved).
  const selected =
    sel.mode === "project" ? items.find((p) => p.id === sel.id) : undefined;
  const selectedSpoke =
    sel.mode === "division" ? sel.id : sel.mode === "project" ? selected?.spokeId : undefined;

  function select(next: Selection) {
    setError("");
    setSel(next);
    // Below the wide layout the panel sits under the map, so bring it into view.
    if (next.mode !== "overview" && window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function tick(project: MapProject, taskId: number, done: boolean) {
    setError("");
    const before = counts(project);
    if (done && before.total > 0 && before.done + 1 === before.total) setPulse((n) => n + 1);
    startTransition(async () => {
      applyTick({ taskId, done });
      const res = await setTaskDone(taskId, done);
      if (res.error) setError(res.error);
    });
  }

  function showTip(id: string, el: Element) {
    const stage = stageRef.current?.getBoundingClientRect();
    const dot = el.getBoundingClientRect();
    if (!stage) return;
    const x = Math.min(Math.max(dot.left + dot.width / 2 - stage.left, 130), stage.width - 130);
    setTip({ id, x, y: dot.top - stage.top });
  }

  const finished = items.filter((p) => matches(p) && counts(p).complete).length;
  const steps = [0, 0.25, 0.5, 0.75];
  const ringLabelAngle = spokeAngle(0.5, spokes.length || 1);
  const tipProject = tip ? items.find((p) => p.id === tip.id) : undefined;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div ref={stageRef} className="relative overflow-hidden rounded-card border border-line bg-surface">
        <svg
          viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`}
          className="block h-auto w-full select-none"
          role="group"
          aria-label="Projects map: divisions around LEU"
        >
          <defs>
            <radialGradient id="leu-core-glow">
              <stop offset="0%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.22 }} />
              <stop offset="100%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0 }} />
            </radialGradient>
          </defs>

          {/* How far along: rings at 0 / 25 / 50 / 75% done */}
          <g aria-hidden="true">
            {steps.map((f) => {
              const r = radiusFor(f);
              return (
                <g key={f}>
                  <circle r={r} className="fill-none stroke-line" strokeWidth={1} />
                  {spokes.length > 1 && (
                    <text
                      x={Math.cos(ringLabelAngle) * r}
                      y={Math.sin(ringLabelAngle) * r + 4}
                      textAnchor="middle"
                      className="fill-faint text-[12px] font-medium"
                    >
                      {f * 100}%
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {spokes.map((s, i) => {
            const a = spokeAngle(i, spokes.length);
            const cos = Math.cos(a);
            const sin = Math.sin(a);
            const here = items.filter((p) => p.spokeId === s.id && matches(p));
            const active = here.filter((p) => !counts(p).complete).length;
            const strength = Math.min(active, 5);
            const label = labelPlacement(a);
            const isSel = selectedSpoke === s.id;
            const countText = active ? `${active} active` : here.length ? `${here.length} finished` : "no projects";
            const x1 = cos * (MAP.coreRadius + 4);
            const y1 = sin * (MAP.coreRadius + 4);
            const x2 = cos * MAP.outerRadius;
            const y2 = sin * MAP.outerRadius;
            return (
              <g key={s.id} className="group">
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={`${s.name}: ${countText}`}
                  className="cursor-pointer outline-none"
                  onClick={() => select({ mode: "division", id: s.id })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select({ mode: "division", id: s.id }); }
                  }}
                >
                  <title>{s.name}</title>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={30} />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    strokeLinecap="round"
                    strokeWidth={active ? 1.6 + strength * 1.1 : 1.4}
                    strokeDasharray={active || here.length ? undefined : "3 8"}
                    strokeOpacity={isSel ? 1 : active ? 0.35 + strength * 0.12 : 0.8}
                    className={`transition-[stroke,stroke-width,stroke-opacity] duration-300 group-hover:stroke-accent-strong group-hover:[stroke-opacity:1] group-focus-within:stroke-accent-strong ${
                      isSel ? "stroke-accent-strong" : active ? "stroke-accent" : "stroke-faint"
                    }`}
                  />
                  <text
                    x={label.x}
                    y={label.nameY}
                    textAnchor={label.anchor}
                    className={`text-[22px] font-semibold transition-colors group-hover:fill-accent-strong group-focus-within:fill-accent-strong ${
                      isSel ? "fill-accent-strong" : active || here.length ? "fill-fg" : "fill-muted"
                    } ${s.isUnsorted ? "italic" : ""}`}
                  >
                    {shortLabel(s.name)}
                  </text>
                  <text x={label.x} y={label.countY} textAnchor={label.anchor} className="fill-muted text-[15px]">
                    {countText}
                  </text>
                </g>
                {isAdmin && !s.isUnsorted && (
                  <g
                    role="link"
                    tabIndex={0}
                    aria-label={`New project in ${s.name}`}
                    transform={`translate(${cos * MAP.plusRadius} ${sin * MAP.plusRadius})`}
                    className="cursor-pointer opacity-0 outline-none transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                    onClick={() => router.push(`/projects/new?division=${s.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/projects/new?division=${s.id}`); }
                    }}
                  >
                    <title>{`New project in ${s.name}`}</title>
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
            aria-label={`Overview. ${finished} finished`}
            className="cursor-pointer outline-none"
            onClick={() => select({ mode: "overview" })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select({ mode: "overview" }); }
            }}
          >
            <circle r={150} fill="url(#leu-core-glow)" />
            {pulse > 0 && (
              <circle
                key={pulse}
                r={MAP.coreRadius}
                className="animate-core-pulse fill-none stroke-accent-strong"
                strokeWidth={2}
              />
            )}
            <circle r={MAP.coreRadius} className="fill-bg stroke-accent" strokeWidth={1.5} />
            <text y={7} textAnchor="middle" className="fill-accent-strong text-[30px] font-semibold tracking-[0.06em]">
              LEU
            </text>
            <text y={27} textAnchor="middle" className="fill-muted text-[10px] font-medium tracking-[0.12em]">
              {finished} DONE
            </text>
          </g>

          <g>
            {items.map((p) => {
              const pos = positions.get(p.id);
              if (!pos) return null;
              const c = counts(p);
              const isSel = sel.mode === "project" && sel.id === p.id;
              const dim = !matches(p);
              return (
                <g
                  key={p.id}
                  role="button"
                  tabIndex={dim ? -1 : 0}
                  aria-label={`${p.name}, ${p.assignee}, ${c.done} of ${c.total} items done`}
                  style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
                  className={`group/dot cursor-pointer outline-none transition-[transform,opacity] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] ${dim ? "opacity-15" : ""}`}
                  onClick={() => select({ mode: "project", id: p.id })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select({ mode: "project", id: p.id }); }
                  }}
                  onPointerEnter={(e) => showTip(p.id, e.currentTarget)}
                  onPointerLeave={() => setTip(null)}
                  onFocus={(e) => showTip(p.id, e.currentTarget)}
                  onBlur={() => setTip(null)}
                >
                  <circle
                    r={pos.complete ? 7.5 : 15}
                    className={`fill-none stroke-fg transition-opacity group-hover/dot:opacity-90 group-focus-visible/dot:opacity-90 ${isSel ? "opacity-90" : "opacity-0"}`}
                    strokeWidth={1.5}
                  />
                  <circle
                    r={pos.complete ? MAP.doneDotRadius : MAP.dotRadius}
                    style={{ fill: p.color }}
                    className="stroke-surface"
                    strokeWidth={2}
                  />
                </g>
              );
            })}
          </g>
        </svg>

        {tip && tipProject && (
          <div
            className="pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-control border border-line bg-surface-2 px-3 py-2 text-sm shadow-float"
            style={{ left: tip.x, top: tip.y }}
          >
            <p className="font-medium">{tipProject.name}</p>
            <p className="text-xs text-muted">
              {tipProject.assignee} · {spokes.find((s) => s.id === tipProject.spokeId)?.name}
            </p>
            <p className="mt-1 text-xs text-accent-strong">
              {(() => {
                const c = counts(tipProject);
                return `${c.done} of ${c.total} items · ${c.complete ? "done" : `${Math.round(fraction(c.done, c.total) * 100)}%`}`;
              })()}
            </p>
          </div>
        )}

        <p className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-5 py-3 text-xs text-muted">
          <span>Dots start at the tip of their division and move toward LEU as their checklist gets done.</span>
          <span>Finished projects join the core.</span>
          {isAdmin && <span>Hover a division and press + to add a project there.</span>}
        </p>
      </div>

      <aside ref={panelRef} className="card space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto" aria-live="polite">
        {sel.mode === "project" && selected ? (
          <ProjectPanel
            project={selected}
            spoke={spokes.find((s) => s.id === selected.spokeId)}
            canTick={isAdmin || selected.assigneeId === meId}
            today={today}
            error={error}
            onBack={() => select({ mode: "division", id: selected.spokeId })}
            onTick={(taskId, done) => tick(selected, taskId, done)}
          />
        ) : sel.mode === "division" && spokes.some((s) => s.id === sel.id) ? (
          <DivisionPanel
            spoke={spokes.find((s) => s.id === sel.id)!}
            projects={items.filter((p) => p.spokeId === sel.id && matches(p))}
            isAdmin={isAdmin}
            today={today}
            onBack={() => select({ mode: "overview" })}
            onPick={(id) => select({ mode: "project", id })}
          />
        ) : (
          <OverviewPanel
            projects={items.filter(matches)}
            spokes={spokes}
            isAdmin={isAdmin}
            filtered={Boolean(person)}
            today={today}
            onPick={(id) => select({ mode: "project", id })}
          />
        )}
      </aside>
    </div>
  );
}

function Row({
  project,
  today,
  sub,
  onPick,
}: {
  project: MapProject;
  today: string;
  sub?: string;
  onPick: (id: string) => void;
}) {
  const c = counts(project);
  return (
    <button
      type="button"
      onClick={() => onPick(project.id)}
      className="block w-full space-y-2 rounded-control border border-transparent px-3 py-2.5 text-left transition-colors hover:border-line hover:bg-surface-2"
    >
      <span className="flex items-start gap-2.5">
        <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: project.color }} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium break-words">{project.name}</span>
          {sub !== "" && <span className="mt-0.5 block text-xs text-muted">{sub ?? project.assignee}</span>}
        </span>
        <DueBadge date={project.dueDate} today={today} complete={c.complete} />
      </span>
      <ProgressBar done={c.done} total={c.total} />
    </button>
  );
}

function OverviewPanel({
  projects,
  spokes,
  isAdmin,
  filtered,
  today,
  onPick,
}: {
  projects: MapProject[];
  spokes: MapSpoke[];
  isAdmin: boolean;
  filtered: boolean;
  today: string;
  onPick: (id: string) => void;
}) {
  const withCounts = projects.map((p) => ({ p, ...counts(p) }));
  const active = withCounts.filter((x) => !x.complete);
  const left = active.reduce((n, x) => n + x.total - x.done, 0);
  const f = (x: { done: number; total: number }) => fraction(x.done, x.total);
  const stuck = active.filter((x) => f(x) < 0.25).sort((a, b) => f(a) - f(b)).slice(0, 6);
  const close = active.filter((x) => f(x) >= 0.75).sort((a, b) => f(b) - f(a)).slice(0, 6);
  const spokeName = (id: string) => spokes.find((s) => s.id === id)?.name ?? "";
  const sub = (p: MapProject) => (isAdmin ? `${spokeName(p.spokeId)} · ${p.assignee}` : spokeName(p.spokeId));

  if (!spokes.length) {
    return (
      <div className="space-y-3">
        <h2 className="section-title">Overview</h2>
        <p className="text-sm text-muted">There are no divisions yet, so the map is empty.</p>
        {isAdmin && <Link href="/projects/divisions" className="btn btn-secondary">Add divisions</Link>}
      </div>
    );
  }

  return (
    <>
      <div>
        <h2 className="section-title">Overview</h2>
        <p className="mt-0.5 text-sm text-muted">
          {isAdmin ? (filtered ? "Filtered by person" : "Everyone") : "Your projects"} · {spokes.length} divisions
        </p>
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-muted">
          {isAdmin
            ? filtered
              ? "No projects for this person."
              : "No projects yet. Press + on a division, or use New project, to hand out the first one."
            : "No projects assigned to you yet."}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Active" value={active.length} />
            <Stat label="Items left" value={left} />
            <Stat label="Finished" value={projects.length - active.length} />
          </dl>
          <Group title="Stuck at the edge" hint="under 25% done" empty="Nothing stuck right now.">
            {stuck.map((x) => <Row key={x.p.id} project={x.p} today={today} sub={sub(x.p)} onPick={onPick} />)}
          </Group>
          <Group title="Almost at the core" hint="75% or more" empty="Nothing close to done yet.">
            {close.map((x) => <Row key={x.p.id} project={x.p} today={today} sub={sub(x.p)} onPick={onPick} />)}
          </Group>
        </>
      )}
    </>
  );
}

function DivisionPanel({
  spoke,
  projects,
  isAdmin,
  today,
  onBack,
  onPick,
}: {
  spoke: MapSpoke;
  projects: MapProject[];
  isAdmin: boolean;
  today: string;
  onBack: () => void;
  onPick: (id: string) => void;
}) {
  const active = projects
    .filter((p) => !counts(p).complete)
    .sort((a, b) => fraction(counts(a).done, counts(a).total) - fraction(counts(b).done, counts(b).total));
  const done = projects.filter((p) => counts(p).complete);
  return (
    <>
      <BackButton onClick={onBack}>Overview</BackButton>
      <div>
        <h2 className="section-title break-words">{spoke.name}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {active.length} active · {done.length} finished
        </p>
      </div>
      {spoke.isUnsorted && (
        <p className="text-sm text-warning">
          These projects were made before divisions existed. Open each one and pick a division to put it on the map.
        </p>
      )}
      {isAdmin && !spoke.isUnsorted && (
        <Link href={`/projects/new?division=${spoke.id}`} className="btn btn-primary w-full">
          + New project in {shortLabel(spoke.name, 24)}
        </Link>
      )}
      <Group title="In progress" empty={`Nobody is working on ${spoke.name} yet.`}>
        {active.map((p) => <Row key={p.id} project={p} today={today} sub={isAdmin ? undefined : ""} onPick={onPick} />)}
      </Group>
      {done.length > 0 && (
        <Group title="Finished">
          {done.map((p) => <Row key={p.id} project={p} today={today} sub={isAdmin ? undefined : ""} onPick={onPick} />)}
        </Group>
      )}
    </>
  );
}

function ProjectPanel({
  project,
  spoke,
  canTick,
  today,
  error,
  onBack,
  onTick,
}: {
  project: MapProject;
  spoke?: MapSpoke;
  canTick: boolean;
  today: string;
  error: string;
  onBack: () => void;
  onTick: (taskId: number, done: boolean) => void;
}) {
  const c = counts(project);
  return (
    <>
      <BackButton onClick={onBack}>{spoke?.name ?? "Division"}</BackButton>
      <div className="space-y-1">
        <h2 className="section-title break-words">{project.name}</h2>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: project.color }} />
            {project.assignee}
          </span>
          <span aria-hidden>·</span>
          <DueBadge date={project.dueDate} today={today} complete={c.complete} />
        </p>
      </div>
      <div className="space-y-1.5">
        <ProgressBar done={c.done} total={c.total} />
        {c.complete && <p className="text-xs font-medium text-success">Done. It has joined the core.</p>}
      </div>

      <div className="space-y-2">
        <h3 className="group-title">Checklist</h3>
        {project.tasks.length === 0 ? (
          <p className="text-sm text-muted">No items on this checklist yet.</p>
        ) : (
          <ul className="max-h-[22rem] space-y-0.5 overflow-y-auto">
            {project.tasks.map((t) => (
              <li key={t.id}>
                <label
                  className={`flex items-start gap-3 rounded-control px-2 py-2 ${canTick ? "cursor-pointer hover:bg-surface-2" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={t.done}
                    disabled={!canTick}
                    onChange={(e) => onTick(t.id, e.target.checked)}
                    className="mt-0.5 size-[18px] shrink-0 cursor-pointer disabled:cursor-default"
                  />
                  <span className={`min-w-0 break-words ${t.done ? "text-muted line-through" : ""}`}>{t.title}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>

      <Link href={`/projects/${project.id}`} className="btn btn-secondary w-full">
        Open project
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse rounded-control border border-line bg-bg px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

function Group({
  title,
  hint,
  empty,
  children,
}: {
  title: string;
  hint?: string;
  empty?: string;
  children: React.ReactNode[];
}) {
  if (!children.length && !empty) return null;
  return (
    <section className="space-y-1.5">
      <h3 className="group-title">
        {title} {hint && <span className="font-normal text-muted">· {hint}</span>}
      </h3>
      {children.length ? <div className="-mx-3">{children}</div> : <p className="text-sm text-muted">{empty}</p>}
    </section>
  );
}
