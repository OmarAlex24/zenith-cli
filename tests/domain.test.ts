import { describe, expect, test } from "bun:test";
import { ok, fail, ZenithError } from "../src/cli/json-output";
import { ContextSnapshotSchema, CreatePlanInputSchema } from "../src/domain/schemas";

describe("domain schemas and json envelope", () => {
  test("validates plan input with at least one phase", () => {
    const parsed = CreatePlanInputSchema.parse({
      title: "Lifecycle v1",
      phases: [{ title: "Foundation" }],
    });

    expect(parsed.status).toBe("active");
    expect(parsed.phases[0]?.status).toBe("todo");
  });

  test("normalizes legacy phase and roadmap item statuses", () => {
    const parsed = CreatePlanInputSchema.parse({
      title: "Legacy v1",
      phases: [
        { title: "A", status: "pending" },
        { title: "B", status: "completed" },
      ],
    });

    expect(parsed.phases[0]?.status).toBe("todo");
    expect(parsed.phases[1]?.status).toBe("done");
  });

  test("wraps success output in the stable envelope", () => {
    const envelope = ok({ value: 1 });
    expect(envelope.ok).toBe(true);
    expect(envelope.meta.schemaVersion).toBe(1);
    expect(envelope.errors).toEqual([]);
  });

  test("wraps Zenith errors with code and details", () => {
    const envelope = fail(new ZenithError("No project", { code: "project_not_registered", details: { rootPath: "/x" } }));
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("project_not_registered");
    expect(envelope.errors[0]?.details).toEqual({ rootPath: "/x" });

    const defaultEnvelope = fail(new ZenithError("Generic"));
    expect(defaultEnvelope.errors[0]?.code).toBe("zenith_error");
  });

  test("validates context snapshots", () => {
    const parsed = ContextSnapshotSchema.parse({
      project: null,
      git: {
        isGitRepo: false,
        rootPath: "/work/zenith",
        changedFiles: [],
        dirty: false,
      },
      registered: false,
      currentBrief: null,
      recentRoadmaps: [],
      openSpikes: [],
      activePlan: null,
      currentPhase: null,
      selectedPhase: null,
      recentSessions: [],
      recentDecisions: [],
      openFindings: [],
      next: {
        recommendation: "Run zenith init",
        reason: "Project is not registered in Zenith yet.",
        evidence: ["/work/zenith"],
      },
      markdown: "# Zenith Context",
    });

    expect(parsed.next.recommendation).toBe("Run zenith init");
  });
});
