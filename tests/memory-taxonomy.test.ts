import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createZenithApp } from "../src/app/factory";
import { openZenithDatabase } from "../src/storage/database";
import { cleanupTempDir, makeTempDir, runDecode } from "./helpers";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    cleanupTempDir(tempDirs.pop()!);
  }
});

describe("memory taxonomy", () => {
  test("migration v2 creates typed memory tables", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });

    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('project_briefs', 'roadmaps', 'roadmap_items', 'spikes') ORDER BY name",
      )
      .all()
      .map((row) => row.name);

    expect(tables).toEqual(["project_briefs", "roadmap_items", "roadmaps", "spikes"]);
    db.close();
  });

  test("briefs are versioned and only one is current", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    const services = createZenithApp({ cwd, zenithHome });

    await services.app.registerProject();
    const first = await services.app.setBrief({
      title: "Zenith CLI Brief v1",
      summary: "Original project memory idea.",
      body: "Zenith CLI coordinates agents with durable local memory.",
      source: "project brief",
    });
    const second = await services.app.setBrief({
      title: "Zenith CLI Brief",
      summary: "Local-first project memory and agent coordination.",
      body: "Zenith keeps plans, roadmaps, spikes, decisions, findings and sessions scoped by project.",
    });

    const current = await services.app.showBrief();
    const all = await services.app.listBriefs();

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(current?.id).toBe(second.id);
    expect(all).toHaveLength(2);
    expect(all[0]?.status).toBe("current");
    expect(all[1]?.status).toBe("archived");
    services.close();
  });

  test("roadmaps can be updated and imported explicitly from plans", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    const services = createZenithApp({ cwd, zenithHome });

    await services.app.registerProject();
    const roadmap = await services.app.createRoadmap({
      title: "Product Roadmap",
      items: [{ title: "Brief memory" }, { title: "Spike memory" }],
    });
    const updated = await services.app.updateRoadmap(roadmap.id, {
      description: "Long-running product direction.",
      status: "paused",
    });
    const itemUpdated = await services.app.updateRoadmapItem(roadmap.id, {
      itemTitle: "Brief memory",
      status: "done",
      evidence: [{ kind: "note", value: "Brief commands shipped." }],
    });
    const plan = await services.app.createPlan({
      title: "Implementation Roadmap",
      status: "paused",
      phases: [{ title: "Foundation", status: "completed" }, { title: "Context" }],
    });
    const imported = await services.app.importPlanToRoadmap(plan.id, {
      status: "active",
      archivePlan: true,
    });
    const archivedPlan = await services.app.showPlan(plan.id);

    expect(updated.status).toBe("paused");
    expect(itemUpdated.items[0]?.status).toBe("done");
    expect(itemUpdated.items[0]?.evidence[0]?.value).toBe("Brief commands shipped.");
    expect(imported.sourcePlanId).toBe(plan.id);
    expect(imported.items[0]?.sourcePhaseId).toBe(plan.phases[0]?.id);
    expect(imported.items[0]?.status).toBe("done");
    expect(archivedPlan.status).toBe("archived");
    services.close();
  });

  test("spikes support create, record, list, show, and conclude", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    const services = createZenithApp({ cwd, zenithHome });

    await services.app.registerProject();
    const open = await services.app.createSpike({
      title: "SQLite spike",
      question: "Should Zenith use SQLite or JSON files?",
      hypothesis: "SQLite gives queryable local memory without a server.",
      options: ["SQLite", "JSON files"],
    });
    const concluded = await services.app.concludeSpike(open.id, {
      result: "SQLite supports typed project memory well.",
      recommendation: "Use SQLite for v1.",
      evidence: [{ kind: "note", value: "Migration tests pass." }],
    });
    const recorded = await services.app.recordSpike({
      question: "Should roadmaps be plans?",
      result: "No. Roadmaps are direction, plans are execution.",
      recommendation: "Store roadmaps separately.",
    });
    const spikes = await services.app.listSpikes();

    expect(open.status).toBe("open");
    expect(concluded.status).toBe("concluded");
    expect(concluded.recommendation).toBe("Use SQLite for v1.");
    expect(recorded.status).toBe("concluded");
    expect(spikes.map((spike) => spike.id)).toContain(recorded.id);
    services.close();
  });

  test("context includes brief, roadmaps, and open spikes", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    const services = createZenithApp({ cwd, zenithHome });

    await services.app.registerProject();
    await services.app.setBrief({
      title: "Zenith Brief",
      summary: "Local-first project memory.",
      body: "The product keeps non-executable memory out of plans.",
    });
    await services.app.createRoadmap({
      title: "Product Roadmap",
      items: [{ title: "Brief memory" }],
    });
    await services.app.createSpike({
      title: "Storage spike",
      question: "Which storage model should roadmap items use?",
    });

    const context = await services.app.getContext();
    const compact = await services.app.compactContext();
    const resume = await services.app.resume();

    expect(context.currentBrief?.title).toBe("Zenith Brief");
    expect(context.recentRoadmaps[0]?.title).toBe("Product Roadmap");
    expect(context.openSpikes[0]?.title).toBe("Storage spike");
    expect(context.markdown).toContain("## Roadmaps");
    expect(compact.currentBrief?.summary).toBe("Local-first project memory.");
    expect(resume.openSpikes[0]?.title).toBe("Storage spike");
    services.close();
  });

  test("new CLI commands emit stable JSON envelopes", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const brief = await runDecode(["brief", "set", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Zenith Brief",
        summary: "Local-first memory.",
        body: "Keep project intent separate from executable plans.",
      },
    });
    const briefShow = await runDecode(["brief", "show", "--json"], { cwd, zenithHome });
    const briefList = await runDecode(["brief", "list", "--json"], { cwd, zenithHome });

    const roadmap = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Product Roadmap",
        items: [{ title: "Brief memory" }],
      },
    });
    const roadmapId = (roadmap.json as any).data.id as string;
    const itemId = (roadmap.json as any).data.items[0].id as string;
    const roadmapList = await runDecode(["roadmap", "list", "--json"], { cwd, zenithHome });
    const roadmapShow = await runDecode(["roadmap", "show", roadmapId, "--json"], { cwd, zenithHome });
    const roadmapUpdate = await runDecode(["roadmap", "update", roadmapId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { status: "paused" },
    });
    const roadmapItemUpdate = await runDecode(["roadmap", "update-item", roadmapId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { itemId, status: "done" },
    });

    const plan = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Implementation Roadmap",
        status: "paused",
        phases: [{ title: "Foundation", status: "completed" }],
      },
    });
    const planId = (plan.json as any).data.id as string;
    const imported = await runDecode(["roadmap", "import-plan", planId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { archivePlan: true },
    });

    const spike = await runDecode(["spike", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Storage spike",
        question: "Which store should Zenith use?",
      },
    });
    const spikeId = (spike.json as any).data.id as string;
    const spikeRecord = await runDecode(["spike", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        question: "Should roadmaps be plans?",
        result: "No.",
        recommendation: "Use roadmaps.",
      },
    });
    const spikeList = await runDecode(["spike", "list", "--json"], { cwd, zenithHome });
    const spikeShow = await runDecode(["spike", "show", spikeId, "--json"], { cwd, zenithHome });
    const spikeConclude = await runDecode(["spike", "conclude", spikeId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        result: "SQLite is sufficient.",
        recommendation: "Use SQLite.",
      },
    });

    for (const result of [
      brief,
      briefShow,
      briefList,
      roadmap,
      roadmapList,
      roadmapShow,
      roadmapUpdate,
      roadmapItemUpdate,
      imported,
      spike,
      spikeRecord,
      spikeList,
      spikeShow,
      spikeConclude,
    ]) {
      expect(result.exitCode).toBe(0);
      expect((result.json as any).ok).toBe(true);
      expect((result.json as any).meta.schemaVersion).toBe(1);
    }

    expect((briefShow.json as any).data.id).toBe((brief.json as any).data.id);
    expect((roadmapItemUpdate.json as any).data.items[0].status).toBe("done");
    expect((imported.json as any).data.sourcePlanId).toBe(planId);
    expect((spikeConclude.json as any).data.status).toBe("concluded");
  });
});
