import type { Event, Finding, Plan, Roadmap, RoadmapItem } from "../domain/schemas";
import type { EventDayCount, EventWindowSummary } from "../storage/repository";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_ACTIVITY_WEEKS = 53;
const ACTIVITY_ROWS = 7;

export type ActivityDay = {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
};

export type ActivityReport = {
  generatedAt: string;
  window: {
    since: string;
    until: string;
    weeks: number;
    days: number;
    weekStartsOn: "sunday";
  };
  grid: {
    columns: number;
    rows: number;
    maxCount: number;
    days: ActivityDay[];
    weeks: ActivityDay[][];
  };
  stats: {
    totalEvents: number;
    activeDays: number;
    currentStreak: number;
    longestStreak: number;
    maxDailyEvents: number;
  };
};

export type ActivityWindow = {
  startDate: string;
  endDate: string;
  finalGridDate: string;
  weeks: number;
  days: number;
};

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
  discarded: number;
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

export function activityWindow(now: string, weeks = DEFAULT_ACTIVITY_WEEKS): ActivityWindow {
  const currentDate = startOfUtcDay(new Date(now));
  const currentWeekStart = addUtcDays(currentDate, -currentDate.getUTCDay());
  const startDate = addUtcDays(currentWeekStart, -(weeks - 1) * ACTIVITY_ROWS);
  const finalGridDate = addUtcDays(startDate, weeks * ACTIVITY_ROWS - 1);

  return {
    startDate: formatUtcDate(startDate),
    endDate: formatUtcDate(currentDate),
    finalGridDate: formatUtcDate(finalGridDate),
    weeks,
    days: weeks * ACTIVITY_ROWS,
  };
}

export function buildActivityReport(
  dayCounts: EventDayCount[],
  options: { now: string; weeks?: number },
): ActivityReport {
  const generatedAt = options.now;
  const window = activityWindow(generatedAt, options.weeks ?? DEFAULT_ACTIVITY_WEEKS);
  const countsByDate = new Map<string, number>();
  for (const entry of dayCounts) {
    countsByDate.set(entry.date, (countsByDate.get(entry.date) ?? 0) + entry.count);
  }

  const startDate = parseUtcDate(window.startDate);
  const endDate = parseUtcDate(window.endDate);
  const days = Array.from({ length: window.days }, (_, index): ActivityDay => {
    const date = addUtcDays(startDate, index);
    const dateKey = formatUtcDate(date);
    const future = date.getTime() > endDate.getTime();
    return {
      date: dateKey,
      count: future ? 0 : (countsByDate.get(dateKey) ?? 0),
      level: 0,
      future,
    };
  });

  const maxDailyEvents = days.reduce((max, day) => (day.future ? max : Math.max(max, day.count)), 0);
  const leveledDays = days.map((day) => ({
    ...day,
    level: activityLevel(day.count, maxDailyEvents),
  }));

  const nonFutureDays = leveledDays.filter((day) => !day.future);
  return {
    generatedAt,
    window: {
      since: `${window.startDate}T00:00:00.000Z`,
      until: `${window.endDate}T23:59:59.999Z`,
      weeks: window.weeks,
      days: window.days,
      weekStartsOn: "sunday",
    },
    grid: {
      columns: window.weeks,
      rows: ACTIVITY_ROWS,
      maxCount: maxDailyEvents,
      days: leveledDays,
      weeks: chunkWeeks(leveledDays),
    },
    stats: {
      totalEvents: nonFutureDays.reduce((total, day) => total + day.count, 0),
      activeDays: nonFutureDays.filter((day) => day.count > 0).length,
      currentStreak: currentStreak(nonFutureDays),
      longestStreak: longestStreak(nonFutureDays),
      maxDailyEvents,
    },
  };
}

export function roadmapProgress(roadmaps: Roadmap[]): RoadmapProgress[] {
  return roadmaps.map((roadmap) => {
    const done = roadmap.items.filter((item) => item.status === "done").length;
    const inProgress = roadmap.items.filter((item) => item.status === "in_progress").length;
    const todo = roadmap.items.filter((item) => item.status === "todo").length;
    const deferred = roadmap.items.filter((item) => item.status === "deferred").length;
    const discarded = roadmap.items.filter((item) => item.status === "discarded").length;
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
      discarded,
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

  const phase =
    plan.phases.find((candidate) => candidate.status === "in_progress") ??
    plan.phases.find((candidate) => candidate.status === "needs_review") ??
    plan.phases.find((candidate) => candidate.status === "todo");
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

function activityLevel(count: number, maxDailyEvents: number): ActivityDay["level"] {
  if (count <= 0 || maxDailyEvents <= 0) return 0;
  const ratio = count / maxDailyEvents;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function chunkWeeks(days: ActivityDay[]): ActivityDay[][] {
  const weeks: ActivityDay[][] = [];
  for (let index = 0; index < days.length; index += ACTIVITY_ROWS) {
    weeks.push(days.slice(index, index + ACTIVITY_ROWS));
  }
  return weeks;
}

function currentStreak(days: ActivityDay[]): number {
  let streak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index]!.count <= 0) break;
    streak += 1;
  }
  return streak;
}

function longestStreak(days: ActivityDay[]): number {
  let longest = 0;
  let current = 0;
  for (const day of days) {
    if (day.count > 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function parseUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
