import { describe, expect, test } from "bun:test";
import { buildActivityReport } from "../src/app/telemetry";

describe("activity telemetry", () => {
  test("builds a fixed 53-week grid with levels and streaks", () => {
    const report = buildActivityReport(
      [
        { date: "2026-01-01", count: 16 },
        { date: "2026-01-05", count: 4 },
        { date: "2026-01-06", count: 8 },
        { date: "2026-01-07", count: 12 },
        { date: "2026-01-08", count: 99 },
      ],
      { now: "2026-01-07T12:00:00.000Z" },
    );

    expect(report.window.since).toBe("2025-01-05T00:00:00.000Z");
    expect(report.window.until).toBe("2026-01-07T23:59:59.999Z");
    expect(report.grid.columns).toBe(53);
    expect(report.grid.rows).toBe(7);
    expect(report.grid.days).toHaveLength(371);
    expect(report.grid.weeks).toHaveLength(53);
    expect(report.grid.weeks.every((week) => week.length === 7)).toBe(true);

    expect(day(report, "2026-01-01").level).toBe(4);
    expect(day(report, "2026-01-05").level).toBe(1);
    expect(day(report, "2026-01-06").level).toBe(2);
    expect(day(report, "2026-01-07").level).toBe(3);
    expect(day(report, "2026-01-04").level).toBe(0);
    expect(day(report, "2026-01-08").future).toBe(true);
    expect(day(report, "2026-01-08").count).toBe(0);

    expect(report.stats.totalEvents).toBe(40);
    expect(report.stats.activeDays).toBe(4);
    expect(report.stats.currentStreak).toBe(3);
    expect(report.stats.longestStreak).toBe(3);
    expect(report.stats.maxDailyEvents).toBe(16);
  });
});

function day(report: ReturnType<typeof buildActivityReport>, date: string) {
  const found = report.grid.days.find((entry) => entry.date === date);
  if (!found) {
    throw new Error(`Missing day ${date}`);
  }
  return found;
}
