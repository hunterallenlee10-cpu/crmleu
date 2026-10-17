"use client";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FollowUpBadge, STAGE_DOT } from "@/components/badges";
import { needsDetails, StageDialog, type StageExtras } from "@/components/stage-dialog";
import { STAGES, type Lead, type Stage } from "@/lib/types";
import { changeStage } from "../leads/actions";

type Pending = { leadId: string; stage: "lost" | "won" };

export function PipelineBoard({ initialLeads, today }: { initialLeads: Lead[]; today: string }) {
  const [leads, setLeads] = useState(initialLeads);
  // Take fresh server data when it arrives, without remounting the board
  // (remounting would scroll it back to the first column).
  const [serverLeads, setServerLeads] = useState(initialLeads);
  if (initialLeads !== serverLeads) {
    setServerLeads(initialLeads);
    setLeads(initialLeads);
  }
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Mouse: drag after moving 8px. Touch: press and hold, so swiping still scrolls.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  function move(leadId: string, stage: Stage, extras: StageExtras = {}) {
    const before = leads;
    setError("");
    setLeads((ls) =>
      ls.map((l) =>
        l.id === leadId
          ? { ...l, stage, deal_value: extras.dealValue ?? l.deal_value, lost_reason: extras.lostReason ?? l.lost_reason }
          : l,
      ),
    );
    startTransition(async () => {
      const result = await changeStage(leadId, { stage, ...extras });
      if (result.error) {
        setLeads(before);
        setError(result.error);
      } else {
        setPending(null);
      }
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const stage = e.over?.id as Stage | undefined;
    const lead = leads.find((l) => l.id === e.active.id);
    if (!stage || !lead || lead.stage === stage) return;
    if (needsDetails(stage)) setPending({ leadId: lead.id, stage: stage as "lost" | "won" });
    else move(lead.id, stage);
  }

  const active = leads.find((l) => l.id === activeId);
  const pendingLead = pending && leads.find((l) => l.id === pending.leadId);

  return (
    <>
      {error && !pending && (
        <p role="alert" className="mb-4 rounded-xl border border-danger/35 bg-danger/[0.08] px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        {/* Columns snap into place when swiping, but not mid-drag: snapping fights auto-scroll. */}
        <div className={`-mx-5 flex scroll-px-5 gap-4 overflow-x-auto px-5 pb-4 ${activeId ? "" : "snap-x snap-mandatory"}`}>
          {STAGES.map((s) => (
            <Column key={s.value} stage={s.value} label={s.label}>
              {leads
                .filter((l) => l.stage === s.value)
                .map((l) => (
                  <Card key={l.id} lead={l} today={today} dimmed={l.id === activeId} />
                ))}
            </Column>
          ))}
        </div>
        <DragOverlay>{active ? <CardBody lead={active} today={today} lifted /> : null}</DragOverlay>
      </DndContext>
      {pending && pendingLead && (
        <StageDialog
          stage={pending.stage}
          defaultDealValue={pendingLead.deal_value}
          pending={isPending}
          error={error}
          onCancel={() => { setPending(null); setError(""); }}
          onConfirm={(extras) => move(pending.leadId, pending.stage, extras)}
        />
      )}
    </>
  );
}

function Column({ stage, label, children }: { stage: Stage; label: string; children: React.ReactNode[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={`flex w-[78vw] max-w-72 shrink-0 snap-start flex-col rounded-2xl border p-2.5 transition-[border-color,background-color,box-shadow] duration-200 sm:w-72 ${
        isOver
          ? "border-gold/70 bg-gold/[0.06] shadow-[0_0_0_4px_rgb(201_162_74/0.1)]"
          : "border-line bg-white/[0.015]"
      }`}
    >
      <h2 className="mb-2.5 flex items-center justify-between px-1.5 pt-1 text-sm font-semibold">
        <span className={`flex items-center gap-2 ${stage === "won" ? "text-gold-light" : stage === "lost" ? "text-danger" : ""}`}>
          <span aria-hidden="true" className={`size-2 rounded-full ${STAGE_DOT[stage]}`} />
          {label}
        </span>
        <span className="count">{children.length}</span>
      </h2>
      <div className="flex min-h-24 flex-1 flex-col gap-2">{children}</div>
    </section>
  );
}

function Card({ lead, today, dimmed }: { lead: Lead; today: string; dimmed: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`touch-manipulation ${dimmed ? "opacity-30" : ""}`}>
      <Link href={`/leads/${lead.id}`} draggable={false} className="block">
        <CardBody lead={lead} today={today} />
      </Link>
    </div>
  );
}

function CardBody({ lead, today, lifted }: { lead: Lead; today: string; lifted?: boolean }) {
  return (
    <div
      className={`rounded-xl border bg-panel p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.04),0_1px_2px_rgb(0_0_0/0.4)] transition-[border-color,background-color,transform] duration-200 ${
        lifted
          ? "rotate-[1.5deg] border-gold bg-raised shadow-[0_24px_60px_-12px_rgb(0_0_0/0.9),0_0_0_1px_rgb(201_162_74/0.3)]"
          : "border-line hover:-translate-y-px hover:border-gold/40 hover:bg-raised"
      }`}
    >
      <p className="truncate font-semibold tracking-tight">{lead.business_name}</p>
      <p className="truncate text-xs text-muted">{[lead.niche, lead.city].filter(Boolean).join(" · ") || " "}</p>
      <div className="mt-2 flex items-center justify-between">
        <FollowUpBadge date={lead.next_follow_up} today={today} />
        {lead.deal_value != null && (
          <span className="text-xs font-semibold text-gold-light tabular-nums">${Number(lead.deal_value).toLocaleString("en-US")}</span>
        )}
      </div>
    </div>
  );
}
