import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

export const processSessionConformanceTestCount = 5;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Process-session conformance requires an adapter object.");
  }
  for (const name of ["createStore", "isErrorCode"]) {
    if (typeof adapter[name] !== "function") {
      throw new TypeError(`Process-session conformance adapter requires ${name}().`);
    }
  }
  if (typeof adapter.codes?.stopUnconfirmed !== "string" || adapter.codes.stopUnconfirmed.length === 0) {
    throw new TypeError("Process-session conformance adapter requires codes.stopUnconfirmed.");
  }
}

function fakeChild(pid) {
  return Object.assign(new EventEmitter(), {
    pid,
    exitCode: null,
    signalCode: null,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  });
}

async function startFakeSession(store, child, requestKey, maxOutputBytes = 1_024) {
  const result = await store.start({
    workspaceId: "workspace-1",
    requestKey,
    signature: requestKey,
    shell: "powershell",
    workingDirectory: ".",
    timeoutMs: 30_000,
    maxOutputBytes,
    waitMs: 0,
    createChild: () => child,
    terminate: () => {},
  });
  return Number(result.sessionId);
}

export function registerProcessSessionConformanceTests(adapter) {
  validateAdapter(adapter);
  const { createStore, isErrorCode, codes } = adapter;

  test("native process material progress advances only on spawn, output, and terminal evidence", async () => {
    const store = createStore();
    const child = fakeChild(41_000);
    const started = await store.start({
      workspaceId: "workspace-1",
      requestKey: "material-progress-1",
      signature: "material-progress-1",
      shell: "powershell",
      workingDirectory: ".",
      timeoutMs: 30_000,
      maxOutputBytes: 1_024,
      waitMs: 0,
      createChild: () => child,
      terminate: () => {},
    });
    assert.equal(started.waitReason, null);
    assert.equal(started.materialProgress.kind, "spawn");
    assert.equal(started.materialProgress.outputCursor, 0);

    const initialObservedAt = started.materialProgress.lastObservedAt;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    const silent = await store.poll(
      { workspaceId: "workspace-1", sessionId: started.sessionId },
      { cursor: 0, yieldTimeMs: 0 },
    );
    assert.equal(silent.waitReason, null, "Silence must not be promoted into an inferred wait/stall reason.");
    assert.equal(silent.materialProgress.lastObservedAt, initialObservedAt);
    assert.equal(silent.materialProgress.kind, "spawn");
    assert.equal(silent.materialProgress.outputCursor, 0);
    assert.ok(silent.materialProgress.ageMs >= started.materialProgress.ageMs + 10);

    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    child.stderr?.emit("data", "abc");
    const output = await store.poll(
      { workspaceId: "workspace-1", sessionId: started.sessionId },
      { cursor: 0, yieldTimeMs: 0 },
    );
    assert.equal(output.materialProgress.kind, "output");
    assert.equal(output.materialProgress.outputCursor, 3);
    assert.notEqual(output.materialProgress.lastObservedAt, initialObservedAt);

    const listed = store.list({ workspaceId: "workspace-1", requestKey: "material-progress-1", status: "all" });
    assert.equal(listed.sessions[0]?.materialProgress.lastObservedAt, output.materialProgress.lastObservedAt);
    assert.equal(listed.sessions[0]?.materialProgress.kind, output.materialProgress.kind);
    assert.equal(listed.sessions[0]?.materialProgress.outputCursor, output.materialProgress.outputCursor);

    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    child.emit("close", 0, null);
    const terminal = await store.poll(
      { workspaceId: "workspace-1", sessionId: started.sessionId },
      { cursor: 3, yieldTimeMs: 0 },
    );
    assert.equal(terminal.status, "completed");
    assert.equal(terminal.waitReason, null);
    assert.equal(terminal.materialProgress.kind, "terminal");
    assert.equal(terminal.materialProgress.outputCursor, 3);
    assert.notEqual(terminal.materialProgress.lastObservedAt, output.materialProgress.lastObservedAt);
  });

  test("process cursor paging preserves independent UTF-8 decoder state across stdout and stderr", async () => {
    const store = createStore();
    const child = fakeChild(41_001);
    const sessionId = await startFakeSession(store, child, "utf8-page-1");
    const partyHat = Buffer.from("🎉", "utf8");
    const heart = Buffer.from("❤", "utf8");

    child.stdout?.emit("data", partyHat.subarray(0, 2));
    child.stderr?.emit("data", heart.subarray(0, 2));
    child.stdout?.emit("data", partyHat.subarray(2));
    child.stderr?.emit("data", heart.subarray(2));
    child.emit("close", 0, null);

    let cursor = 0;
    let stdout = "";
    let stderr = "";
    let output = "";
    for (let pageIndex = 0; pageIndex < 12; pageIndex += 1) {
      const page = await store.poll(
        { workspaceId: "workspace-1", sessionId },
        { cursor, yieldTimeMs: 0, maxReadBytes: 1 },
      );
      stdout += String(page.stdout);
      stderr += String(page.stderr);
      output += String(page.output);
      cursor = Number(page.nextCursor);
      if (page.hasMore !== true) break;
    }

    assert.equal(stdout, "🎉");
    assert.equal(stderr, "❤");
    assert.equal(output, "🎉❤");
    assert.equal(`${stdout}${stderr}${output}`.includes("\uFFFD"), false);
  });

  test("retention boundary preserves UTF-8 when dropped bytes split a code point", async () => {
    const store = createStore();
    const child = fakeChild(41_003);
    const sessionId = await startFakeSession(store, child, "utf8-retention-1", 1_024);
    const expected = `🎉${"a".repeat(1_021)}`;
    child.stdout?.emit("data", Buffer.from(expected, "utf8"));
    child.emit("close", 0, null);

    const page = await store.poll(
      { workspaceId: "workspace-1", sessionId },
      { cursor: 0, yieldTimeMs: 0, maxReadBytes: 1_024 },
    );
    assert.equal(page.outputLost, true);
    assert.equal(page.outputRetainedBytes, 1_024);
    assert.equal(page.stdout, expected);
    assert.equal(page.output, expected);
    assert.equal(`${page.stdout}${page.output}`.includes("\uFFFD"), false);
  });

  test("workspace stop fails closed and retains ownership when process termination is unconfirmed", async () => {
    const store = createStore();
    const child = fakeChild(41_002);
    await startFakeSession(store, child, "unconfirmed-stop-1");

    await assert.rejects(
      store.stopWorkspace("workspace-1", () => {}),
      (error) => isErrorCode(error, codes.stopUnconfirmed),
    );
    assert.equal(store.summary().running, 1, "An unconfirmed process must remain owned and observable.");

    child.signalCode = "SIGKILL";
    child.emit("close", null, "SIGKILL");
    await store.close(() => {});
  });

  test("process close is terminal before a same-turn stop can re-target its PID", async () => {
    const store = createStore();
    const child = fakeChild(41_004);
    const sessionId = await startFakeSession(store, child, "close-stop-race-1");
    let terminateCalls = 0;

    child.exitCode = 0;
    child.emit("close", 0, null);
    const stopped = await store.stop(
      { workspaceId: "workspace-1", sessionId },
      () => { terminateCalls += 1; },
    );

    assert.equal(stopped.status, "completed");
    assert.equal(terminateCalls, 0, "A close-observed session must not issue another PID-based termination request.");
    await store.close(() => {});
  });
}
