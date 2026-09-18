import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

export const operationStageConformanceTestCount = 8;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Operation-stage conformance requires an adapter object.");
  }
  for (const name of [
    "createBroker",
    "createMemoryMutationLedger",
    "createMemoryStore",
    "createSqliteStore",
    "createError",
    "isErrorCode",
    "projectRuntimeSummary",
  ]) {
    if (typeof adapter[name] !== "function") {
      throw new TypeError(`Operation-stage conformance adapter requires ${name}().`);
    }
  }
  for (const name of ["stageTestFailure", "providerFailure", "operationFailed", "operationRuntimeLost"]) {
    if (typeof adapter.codes?.[name] !== "string" || adapter.codes[name].length === 0) {
      throw new TypeError(`Operation-stage conformance adapter requires codes.${name}.`);
    }
  }
  if (typeof adapter.operationStageSchema !== "string" || adapter.operationStageSchema.length === 0) {
    throw new TypeError("Operation-stage conformance adapter requires operationStageSchema.");
  }
}

function deferred() {
  let resolve = () => undefined;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

export function registerOperationStageConformanceTests(adapter) {
  validateAdapter(adapter);
  const {
    createBroker,
    createMemoryMutationLedger,
    createMemoryStore,
    createSqliteStore,
    createError,
    isErrorCode,
    projectRuntimeSummary,
    codes,
    operationStageSchema,
  } = adapter;

  class StageTestProvider {
    id = "stage-test";
    active = deferred();
    release = deferred();

    async connect() {}
    async close() {}

    async listTools() {
      return ["slow_operation", "failed_operation", "runtime_status", "poll_process", "process_sessions"].map((name) => ({
        provider: this.id,
        name,
        inputSchema: { type: "object" },
        sideEffect: "read",
        destructive: false,
        idempotent: true,
        openWorld: false,
      }));
    }

    async call(tool, _input, options) {
      if (["runtime_status", "poll_process", "process_sessions"].includes(tool)) return { tool };
      if (tool === "failed_operation") {
        options?.reportStage?.({ stage: "transport-active", livenessKind: "transport-inflight" });
        throw createError(codes.stageTestFailure, "expected test failure", { operationApplied: "no" });
      }
      const attribution = {
        workspaceRoot: "C:\\workspaces\\stage-test",
        projectId: "a".repeat(64),
        projectName: "stage-test",
        projectRoot: "C:\\workspaces\\stage-test",
      };
      options?.reportStage?.({ stage: "resource-admission", workspaceId: "ws-stage-test", ...attribution, livenessKind: "broker-inflight" });
      options?.reportStage?.({ stage: "process-starting", workspaceId: "ws-stage-test", ...attribution, livenessKind: "broker-inflight" });
      options?.reportStage?.({
        stage: "process-running",
        workspaceId: "ws-stage-test",
        ...attribution,
        process: { rootPid: 4242, childPid: 4242, sessionId: 7 },
        livenessKind: "process-spawned",
      });
      this.active.resolve();
      await this.release.promise;
      return { value: "execution-result-unchanged" };
    }
  }

  test("durable operation stage telemetry exposes active liveness without heartbeat spam and survives restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nu-operation-stage-"));
    const databasePath = join(directory, "state.sqlite");
    const provider = new StageTestProvider();
    const store = createSqliteStore(databasePath, "runtime-before-restart");
    const broker = createBroker([provider], {
      mutationLedger: createMemoryMutationLedger(),
      operationStageStore: store,
    });
  
    try {
      const pending = broker.execute({
        tool: "slow_operation",
        provider: provider.id,
        input: { workspaceId: "ws-stage-test" },
      }, undefined, undefined, { callerSessionId: "mcp-session-stage-test" });
      await provider.active.promise;
  
      const during = broker.operationEvidence();
      const active = during.operations.find((entry) => entry.tool === "slow_operation");
      assert.ok(active);
      assert.equal(during.active, 1);
      assert.equal(active.status, "active");
      assert.equal(active.currentStage, "process-running");
      assert.equal(active.workspaceId, "ws-stage-test");
      assert.equal(active.callerSessionId, "mcp-session-stage-test");
      assert.equal(active.workspaceRoot, "C:\\workspaces\\stage-test");
      assert.equal(active.projectId, "a".repeat(64));
      assert.equal(active.projectName, "stage-test");
      assert.equal(active.projectRoot, "C:\\workspaces\\stage-test");
      assert.equal(active.process?.rootPid, 4242);
      assert.equal(active.process?.childPid, 4242);
      assert.equal(active.process?.sessionId, 7);
      assert.equal(active.hasLivenessEvidence, true);
      assert.equal(active.livenessKind, "process-spawned");
      assert.ok(active.stageElapsedMs >= 0);
      assert.deepEqual(
        active.transitions.map((entry) => entry.stage),
        ["accepted", "provider-dispatch", "resource-admission", "process-starting", "process-running"],
      );
      const activeEvents = during.events.filter((event) => event.requestId === active.requestId);
      assert.equal(activeEvents.every((event) => event.callerSessionId === "mcp-session-stage-test"), true);
      assert.deepEqual(activeEvents.map((event) => event.sequence), [1, 2, 3, 4, 5]);
      assert.deepEqual(activeEvents.map((event) => event.type), [
        "operation.started",
        "operation.progress",
        "operation.progress",
        "operation.progress",
        "operation.progress",
      ]);
  
      const transitionCount = active.transitions.length;
      await new Promise((resolveWait) => setTimeout(resolveWait, 80));
      const later = broker.operationEvidence().operations.find((entry) => entry.tool === "slow_operation");
      assert.ok(later);
      assert.equal(later.transitions.length, transitionCount, "idle wall time must not create heartbeat transitions");
      assert.ok(later.stageElapsedMs >= active.stageElapsedMs);
  
      provider.release.resolve();
      const envelope = await pending;
      assert.deepEqual(envelope.result, { value: "execution-result-unchanged" });
  
      const completed = broker.operationEvidence().operations.find((entry) => entry.tool === "slow_operation");
      assert.ok(completed);
      assert.equal(completed.status, "completed");
      assert.equal(completed.currentStage, "completed");
      assert.equal(completed.hasLivenessEvidence, false);
      assert.equal(completed.transitions.at(-1)?.stage, "completed");
      const completedEvents = broker.operationEvidence().events.filter((event) => event.requestId === completed.requestId);
      assert.deepEqual(completedEvents.map((event) => event.sequence), [1, 2, 3, 4, 5, 6]);
      assert.equal(completedEvents.at(-1)?.type, "operation.completed");
    } finally {
      await broker.close();
    }
  
    const afterRestart = createSqliteStore(databasePath, "runtime-after-restart");
    try {
      const snapshot = afterRestart.snapshot();
      const completed = snapshot.operations.find((entry) => entry.tool === "slow_operation");
      assert.ok(completed, "completed operation evidence must remain queryable after store restart");
      assert.equal(completed.status, "completed");
      assert.equal(completed.currentStage, "completed");
      assert.equal(completed.process?.rootPid, 4242);
      assert.equal(completed.workspaceRoot, "C:\\workspaces\\stage-test");
      assert.equal(completed.projectId, "a".repeat(64));
      assert.equal(completed.projectName, "stage-test");
      assert.equal(completed.projectRoot, "C:\\workspaces\\stage-test");
      const events = snapshot.events.filter((event) => event.requestId === completed.requestId);
      assert.equal(events.length, 6, "durable operation events must survive store restart");
      assert.equal(events.at(-1)?.type, "operation.completed");
      assert.equal(events.filter((event) => event.type === "operation.completed").length, 1);
    } finally {
      afterRestart.close();
    }
  
    await rm(directory, { recursive: true, force: true });
  });
  
  test("terminal failed operation classification is stable and preserves operationApplied", () => {
    const cases = [
      { requestId: "known", code: codes.providerFailure, operationApplied: "yes", expected: codes.providerFailure },
      { requestId: "blank", code: "   ", operationApplied: "no", expected: codes.operationFailed },
      { requestId: "unknown", code: "", operationApplied: "unknown", expected: codes.operationFailed },
    ];
    const store = createMemoryStore("runtime-failure-normalization");
    for (const entry of cases) {
      store.begin({
        requestId: entry.requestId,
        signature: entry.requestId.padEnd(64, "0"),
        provider: "local",
        tool: "test",
        sideEffect: "unknown",
        startedAt: new Date().toISOString(),
      });
      store.fail(entry.requestId, new Date().toISOString(), {
        code: entry.code,
        operationApplied: entry.operationApplied,
      });
    }
    store.begin({
      requestId: "success",
      signature: "success".padEnd(64, "0"),
      provider: "local",
      tool: "test",
      sideEffect: "read",
      startedAt: new Date().toISOString(),
    });
    store.complete("success", new Date().toISOString());
  
    const snapshot = store.snapshot(10);
    for (const entry of cases) {
      const operation = snapshot.operations.find((candidate) => candidate.requestId === entry.requestId);
      assert.equal(operation?.error?.code, entry.expected);
      assert.equal(operation?.error?.operationApplied, entry.operationApplied);
      const event = snapshot.events.find((candidate) => candidate.requestId === entry.requestId && candidate.type === "operation.failed");
      assert.equal(event?.error?.code, entry.expected);
      assert.equal(event?.error?.operationApplied, entry.operationApplied);
    }
    const success = snapshot.operations.find((entry) => entry.requestId === "success");
    assert.equal(success?.status, "completed");
    assert.equal(success?.error, undefined);
    store.close();
  });
  
  test("runtime restart terminalizes abandoned active operation evidence instead of leaving it permanently active", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nu-operation-stage-abandoned-"));
    const databasePath = join(directory, "state.sqlite");
    const beforeRestart = createSqliteStore(databasePath, "runtime-before-abandon");
    beforeRestart.begin({
      requestId: "request-abandoned",
      requestKey: "stable-abandoned-key",
      signature: "b".repeat(64),
      provider: "local",
      tool: "run_checks",
      sideEffect: "unknown",
      workspaceId: "ws-abandoned",
      startedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    beforeRestart.transition("request-abandoned", {
      stage: "process-running",
      workspaceId: "ws-abandoned",
      process: { rootPid: 4242, childPid: 4242 },
      livenessKind: "process-spawned",
    });
    assert.equal(beforeRestart.snapshot().active, 1);
    beforeRestart.close();
  
    const afterRestart = createSqliteStore(databasePath, "runtime-after-abandon");
    try {
      const snapshot = afterRestart.snapshot();
      const abandoned = snapshot.operations.find((entry) => entry.requestId === "request-abandoned");
      assert.ok(abandoned);
      assert.equal(snapshot.active, 0);
      assert.equal(abandoned.status, "failed");
      assert.equal(abandoned.currentStage, "failed");
      assert.equal(abandoned.hasLivenessEvidence, false);
      assert.deepEqual(abandoned.error, {
        code: codes.operationRuntimeLost,
        operationApplied: "unknown",
      });
      assert.equal(abandoned.transitions.at(-1)?.stage, "failed");
      const events = snapshot.events.filter((event) => event.requestId === "request-abandoned");
      assert.equal(events.at(-1)?.type, "operation.failed");
      assert.equal(events.filter((event) => event.type === "operation.failed").length, 1);
    } finally {
      afterRestart.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  
  test("explicit direct waiting evidence creates a durable waiting event without inventing terminal state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nu-operation-waiting-"));
    const databasePath = join(directory, "state.sqlite");
    const beforeRestart = createSqliteStore(databasePath, "runtime-waiting-before");
    beforeRestart.begin({
      requestId: "request-waiting",
      signature: "c".repeat(64),
      provider: "local",
      tool: "exec_command",
      sideEffect: "unknown",
      workspaceId: "ws-waiting",
      startedAt: new Date().toISOString(),
    });
    beforeRestart.transition("request-waiting", {
      stage: "transport-recovery",
      workspaceId: "ws-waiting",
      livenessKind: "transport-inflight",
      waitingReason: "direct-transport-retry-window",
    });
    const before = beforeRestart.snapshot();
    const waiting = before.events.find((event) => event.type === "operation.waiting");
    assert.ok(waiting);
    assert.equal(waiting.waitingReason, "direct-transport-retry-window");
    assert.equal(before.operations.find((entry) => entry.requestId === "request-waiting")?.status, "active");
    beforeRestart.close();
  
    const afterRestart = createSqliteStore(databasePath, "runtime-waiting-after");
    try {
      const after = afterRestart.snapshot();
      const events = after.events.filter((event) => event.requestId === "request-waiting");
      assert.equal(events.some((event) => event.type === "operation.waiting"), true);
      assert.equal(events.filter((event) => event.type === "operation.failed").length, 1,
        "runtime replacement should add exactly one durable failed terminal event");
    } finally {
      afterRestart.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  
  test("memory operation event sequence remains monotonic after bounded event retention trims old rows", () => {
    const store = createMemoryStore("runtime-memory-sequence");
    const requestId = "request-memory-sequence";
    store.begin({
      requestId,
      signature: "d".repeat(64),
      provider: "local",
      tool: "exec_command",
      sideEffect: "unknown",
      startedAt: new Date().toISOString(),
    });
    for (let index = 0; index < 2_100; index += 1) {
      store.transition(requestId, {
        stage: "process-running",
        waitingReason: `direct-wait-${index}`,
      });
    }
    const events = store.snapshot(50).events.filter((event) => event.requestId === requestId);
    assert.equal(events.length, 200);
    assert.equal(events.at(-1)?.sequence, 2_101);
    for (let index = 1; index < events.length; index += 1) {
      assert.equal(events[index].sequence, events[index - 1].sequence + 1);
    }
  });
  
  test("failed operation records a terminal error stage without changing the provider error", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nu-operation-stage-failure-"));
    const databasePath = join(directory, "state.sqlite");
    const provider = new StageTestProvider();
    const store = createSqliteStore(databasePath, "runtime-failure");
    const broker = createBroker([provider], {
      mutationLedger: createMemoryMutationLedger(),
      operationStageStore: store,
    });
  
    try {
      await assert.rejects(
        broker.execute({ tool: "failed_operation", provider: provider.id, input: { workspaceId: "ws-stage-test" } }),
        (error) => isErrorCode(error, codes.stageTestFailure),
      );
      const failed = broker.operationEvidence().operations.find((entry) => entry.tool === "failed_operation");
      assert.ok(failed);
      assert.equal(failed.status, "failed");
      assert.equal(failed.currentStage, "failed");
      assert.deepEqual(failed.error, { code: codes.stageTestFailure, operationApplied: "no" });
      assert.deepEqual(failed.transitions.map((entry) => entry.stage), [
        "accepted",
        "provider-dispatch",
        "transport-active",
        "failed",
      ]);
      const events = broker.operationEvidence().events.filter((event) => event.requestId === failed.requestId);
      assert.equal(events.at(-1)?.type, "operation.failed");
      assert.equal(events.filter((event) => event.type === "operation.failed").length, 1);
    } finally {
      await broker.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  
  test("telemetry reader tools do not self-instrument into durable stage evidence", async () => {
    const provider = new StageTestProvider();
    const broker = createBroker([provider]);
    try {
      for (const tool of ["runtime_status", "poll_process", "process_sessions"]) {
        const envelope = await broker.execute({
          provider: provider.id,
          tool,
          input: { workspaceId: "ws-stage-test" },
        });
        assert.deepEqual(envelope.result, { tool });
        assert.equal(broker.operationEvidence().operations.some((entry) => entry.tool === tool), false);
      }
    } finally {
      await broker.close();
    }
  });
  
  test("runtime summary projection preserves only bounded operation evidence fields", () => {
    const projected = projectRuntimeSummary({
      detail: "summary",
      operations: {
        schema: operationStageSchema,
        capturedAt: "2026-08-11T17:00:00.000Z",
        active: 1,
        terminal: 2,
        degraded: false,
        telemetryFailures: 0,
        secret: "drop-me",
        events: [{
          eventId: 7,
          requestId: "request-1",
          sequence: 3,
          type: "operation.waiting",
          observedAt: "2026-08-11T16:59:57.000Z",
          stage: "process-running",
          workspaceId: "ws-1",
          waitingReason: "direct-evidence",
          process: { rootPid: 1234, commandLine: "drop-me" },
          secret: "drop-me",
        }],
        operations: [{
          requestId: "request-1",
          requestKey: "stable-key",
          signature: "a".repeat(64),
          provider: "local",
          tool: "exec_command",
          operationType: "local/exec_command",
          sideEffect: "unknown",
          workspaceId: "ws-1",
          status: "active",
          currentStage: "process-running",
          startedAt: "2026-08-11T16:59:55.000Z",
          stageStartedAt: "2026-08-11T16:59:56.000Z",
          elapsedMs: 5000,
          stageElapsedMs: 4000,
          hasLivenessEvidence: true,
          livenessKind: "process-spawned",
          process: { rootPid: 1234, childPid: 1234, commandLine: "must-not-leak" },
          transitions: [{ stage: "process-running", startedAt: "2026-08-11T16:59:56.000Z", extra: "drop-me" }],
          rawCommand: "must-not-leak",
        }],
      },
    });
    const operations = projected.operations;
    assert.equal(operations.secret, undefined);
    const events = operations.events;
    assert.equal(events.length, 1);
    assert.equal(events[0]?.secret, undefined);
    assert.deepEqual(events[0]?.process, { rootPid: 1234 });
    const rows = operations.operations;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.rawCommand, undefined);
    assert.deepEqual(rows[0]?.process, { rootPid: 1234, childPid: 1234 });
    assert.deepEqual(rows[0]?.transitions, [{ stage: "process-running", startedAt: "2026-08-11T16:59:56.000Z" }]);
  });
  
}
