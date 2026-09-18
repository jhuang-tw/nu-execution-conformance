import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

export const resourceAdmissionConformanceTestCount = 3;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Resource-admission conformance requires an adapter object.");
  }
  for (const name of ["evaluateAdmission", "createHistoryStore"]) {
    if (typeof adapter[name] !== "function") {
      throw new TypeError(`Resource-admission conformance adapter requires ${name}().`);
    }
  }
  if (typeof adapter.fixturePrefix !== "string" || adapter.fixturePrefix.length === 0) {
    throw new TypeError("Resource-admission conformance adapter requires fixturePrefix.");
  }
  for (const name of ["capture", "processTree", "host", "admission", "history"]) {
    if (typeof adapter.schemas?.[name] !== "string" || adapter.schemas[name].length === 0) {
      throw new TypeError(`Resource-admission conformance adapter requires schemas.${name}.`);
    }
  }
}

export function registerResourceAdmissionConformanceTests(adapter) {
  validateAdapter(adapter);
  const { evaluateAdmission, createHistoryStore, fixturePrefix, schemas } = adapter;
  const capturedAt = "2026-08-11T00:00:00.000Z";

  test("resource admission uses observed workload demand and physical headroom", () => {
    const base = {
      schema: schemas.capture,
      capturedAt,
      processes: [{
        schema: schemas.processTree,
        capturedAt,
        rootPid: 10,
        processCount: 2,
        descendantCount: 1,
        aggregateWorkingSetBytes: 2_000,
        aggregateCpuTimeMs: 0,
        peakSampledProcessCount: 2,
        degraded: false,
      }],
      degraded: false,
    };
    const healthyHost = {
      schema: schemas.host,
      capturedAt,
      totalPhysicalMemoryBytes: 10_000,
      availablePhysicalMemoryBytes: 4_000,
      loadAverage1m: 0,
      loadAverage5m: 0,
      loadAverage15m: 0,
      degraded: false,
    };
    const admitted = evaluateAdmission({ ...base, host: healthyHost });
    assert.equal(admitted.admitted, true);
    assert.equal(admitted.estimatedNextWorkingSetBytes, 2_000);
    assert.equal(admitted.physicalReserveBytes, 500);
    assert.equal(admitted.requiredAvailablePhysicalMemoryBytes, 2_500);

    const historical = evaluateAdmission(
      { ...base, processes: [], host: healthyHost },
      { historicalPeakWorkingSetBytes: 3_000 },
    );
    assert.equal(historical.admitted, true);
    assert.equal(historical.estimateSource, "history");
    assert.equal(historical.observedRunningWorkingSetBytes, 0);
    assert.equal(historical.historicalPeakWorkingSetBytes, 3_000);
    assert.equal(historical.estimatedNextWorkingSetBytes, 3_000);

    const denied = evaluateAdmission({
      ...base,
      host: { ...healthyHost, availablePhysicalMemoryBytes: 2_499 },
    });
    assert.equal(denied.admitted, false);
    assert.equal(denied.reason, "deny-physical-headroom");

    const degradedDenied = evaluateAdmission({
      ...base,
      degraded: true,
      host: { ...healthyHost, availablePhysicalMemoryBytes: 2_499, degraded: true },
    });
    assert.equal(degradedDenied.admitted, false, "degraded telemetry must not bypass a provable physical denial");
    assert.equal(degradedDenied.reason, "deny-physical-headroom");
  });

  test("resource history persists conservative hashed workload peaks without decreasing them", async (t) => {
    const stateDir = await mkdtemp(join(tmpdir(), fixturePrefix));
    t.after(async () => rm(stateDir, { recursive: true, force: true }));
    const workloadKey = "a".repeat(64);

    const first = createHistoryStore({ stateDir, providerId: "test-provider" });
    assert.equal(await first.observe(workloadKey, 2_000), true);
    assert.equal(await first.observe(workloadKey, 1_000), false);
    assert.equal(await first.estimate(workloadKey), 2_000);
    const summary = await first.summary();
    assert.deepEqual(summary, {
      schema: schemas.history,
      entries: 1,
      maxObservedPeakWorkingSetBytes: 2_000,
      degraded: false,
      updatedAt: summary.updatedAt,
    });

    const reloaded = createHistoryStore({ stateDir, providerId: "test-provider" });
    assert.equal(await reloaded.estimate(workloadKey), 2_000);
    assert.equal((await reloaded.summary()).entries, 1);
  });

  test("resource admission reports commit pressure without blocking and remains usable with degraded telemetry", () => {
    const process = {
      schema: schemas.processTree,
      capturedAt,
      rootPid: 10,
      processCount: 1,
      descendantCount: 0,
      aggregateWorkingSetBytes: 400,
      aggregateCpuTimeMs: 0,
      peakSampledProcessCount: 1,
      degraded: false,
    };
    const host = {
      schema: schemas.host,
      capturedAt,
      totalPhysicalMemoryBytes: 10_000,
      availablePhysicalMemoryBytes: 9_000,
      loadAverage1m: 0,
      loadAverage5m: 0,
      loadAverage15m: 0,
      windowsCommit: { committedBytes: 9_600, commitLimitBytes: 10_000 },
      degraded: false,
    };
    const commitPressure = evaluateAdmission({
      schema: schemas.capture,
      capturedAt,
      host,
      processes: [process],
      degraded: false,
    });
    assert.equal(commitPressure.admitted, true);
    assert.equal(commitPressure.reason, "admit-commit-pressure");
    assert.equal(commitPressure.commit?.headroomBytes, 400);
    assert.equal(commitPressure.commit?.requiredHeadroomBytes, 500);

    const degradedCommit = evaluateAdmission({
      schema: schemas.capture,
      capturedAt,
      host: { ...host, degraded: true },
      processes: [process],
      degraded: true,
    });
    assert.equal(degradedCommit.admitted, true, "degraded telemetry must not block launch when physical headroom is available");
    assert.equal(degradedCommit.reason, "admit-telemetry-degraded");

    const degraded = evaluateAdmission({
      schema: schemas.capture,
      capturedAt,
      host: {
        ...host,
        degraded: true,
        windowsCommit: undefined,
      },
      processes: [],
      degraded: true,
    });
    assert.equal(degraded.admitted, true);
    assert.equal(degraded.reason, "admit-telemetry-degraded");

    const zeroCommitLimit = evaluateAdmission({
      schema: schemas.capture,
      capturedAt,
      host: {
        ...host,
        windowsCommit: { committedBytes: 9_200, commitLimitBytes: 0 },
      },
      processes: [],
      degraded: false,
    });
    assert.equal(zeroCommitLimit.admitted, true, "zero commit limit must not become authoritative denial evidence");
    assert.equal(zeroCommitLimit.degraded, true, "invalid commit evidence must degrade admission telemetry");
    assert.equal(zeroCommitLimit.reason, "admit-telemetry-degraded");
    assert.equal(zeroCommitLimit.commit, undefined);
  });
}
