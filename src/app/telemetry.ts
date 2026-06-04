import type { Event, Finding, Plan, Roadmap, RoadmapItem } from "../domain/schemas";
import type { EventWindowSummary } from "../storage/repository";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type TelemetryWindow = {
  since: string;
  until: string;
  days?: number;
  source: "days" | "latest_session" | "event_id" | "iso" | "fallback";
};

export type EventStats = {
  total: number;
  byType: Array<{ type: string; count: number }>;
  byEntityType: Array<{ entityType: string; count: number }>;
  activeDays: Array<{ date: string; count: number }>;
  firstEventAt?: string;
  lastEventAt?: string;
};

export type RoadmapProgress = {
  roadmapId: string;
  title: string;
  status: Roadmap["status"];
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  deferred: number;
  percentDone: number;
  nextItem?: {
    id: string;
    title: string;
    status: RoadmapItem["status"];
  };
};

export type CompletionMetrics = {
  plansCompleted: number;
  phasesCompleted: number;
  roadmapItemsAdvanced: number;
  findingsRecorded: number;
  sessionsStarted: number;
  sessionsEnded: number;
};

export type FindingSignals = {
  openTotal: number;
  bySeverity: Array<{ severity: Finding["severity"]; count: number }>;
};

export function windowFromDays(days: number, now: string, source: TelemetryWindow["source"] = "days"): TelemetryWindow {
  const since = new Date(Date.parse(now) - days * MS_PER_DAY).toISOString();
  return { since, until: now, days, source };
}

export function eventStatsFromSummary(summary: EventWindowSummary): EventStats {
  return {
    total: summary.total,
    byType: summary.byType.map((entry) => ({ type: entry.key, count: entry.count })),
    byEntityType: summary.byEntityType.map((entry) => ({ entityType: entry.key, count: entry.count })),
    activeDays: summary.activeDays.map((entry) => ({ date: entry.key, count: entry.count })),
    ...(summary.firstEventAt ? { firstEventAt: summary.firstEventAt } : {}),
    ...(summary.lastEventAt ? { lastEventAt: summary.lastEventAt } : {}),
  };
}

export function roadmapProgress(roadmaps: Roadmap[]): RoadmapProgress[] {
  return roadmaps.map((roadmap) => {
    const done = roadmap.items.filter((item) => item.status === "done").length;
    const inProgress = roadmap.items.filter((item) => item.status === "in_progress").length;
    const todo = roadmap.items.filter((item) => item.status === "todo").length;
    const deferred = roadmap.items.filter((item) => item.status === "deferred").length;
    const nextItem = roadmap.items.find((item) => item.status === "in_progress") ?? roadmap.items.find((item) => item.status === "todo");

    return {
      roadmapId: roadmap.id,
      title: roadmap.title,
      status: roadmap.status,
      total: roadmap.items.length,
      done,
      inProgress,
      todo,
      deferred,
      percentDone: roadmap.items.length === 0 ? 0 : Math.round((done / roadmap.items.length) * 100),
      ...(nextItem
        ? {
            nextItem: {
              id: nextItem.id,
              title: nextItem.title,
              status: nextItem.status,
            },
          }
        : {}),
    };
  });
}

export function completionMetrics(events: Event[]): CompletionMetrics {
  return {
    plansCompleted: events.filter((event) => event.type === "plan.completed").length,
    phasesCompleted: events.filter((event) => event.type === "plan.phase_updated" && payloadStatus(event) === "done").length,
    roadmapItemsAdvanced: events.filter((event) => event.type === "roadmap.item_advanced").length,
    findingsRecorded: events.filter((event) => event.type === "finding.recorded").length,
    sessionsStarted: events.filter((event) => event.type === "session.started").length,
    sessionsEnded: events.filter((event) => event.type === "session.ended").length,
  };
}

export function findingSignals(findings: Finding[]): FindingSignals {
  const severities: Finding["severity"][] = ["critical", "high", "medium", "low"];
  return {
    openTotal: findings.length,
    bySeverity: severities
      .map((severity) => ({ severity, count: findings.filter((finding) => finding.severity === severity).length }))
      .filter((entry) => entry.count > 0),
  };
}

export function activePlanSummary(plan: Plan | null): { id: string; title: string; phase?: string } | null {
  if (!plan) {
    return null;
  }

  const phase = plan.phases.find((candidate) => candidate.status === "in_progress") ?? plan.phases.find((candidate) => candidate.status === "todo");
  return {
    id: plan.id,
    title: plan.title,
    ...(phase ? { phase: phase.title } : {}),
  };
}

function payloadStatus(event: Event): string | null {
  if (!event.payload || typeof event.payload !== "object") {
    return null;
  }

  const payload = event.payload as Record<string, unknown>;
  return typeof payload.status === "string" ? payload.status : null;
}
