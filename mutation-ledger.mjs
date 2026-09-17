import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

export const mutationLedgerConformanceTestCount = 7;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Mutation-ledger conformance requires an adapter object.");
  }
  for (const name of [
    "createBroker",
    "createLedger",
    "canonicalCallSignature",
    "createError",
    "isErrorCode",
  ]) {
    if (typeof adapter[name] !== "function") {
      throw new TypeError(`Mutation-ledger conformance adapter requires ${name}().`);
    }
  }
  if (typeof adapter.fixturePrefix !== "string" || !adapter.fixturePrefix.trim()
    || /[\\/]/u.test(adapter.fixturePrefix)) {
    throw new TypeError("Mutation-ledger conformance adapter requires a safe fixturePrefix.");
  }
  for (const name of [
    "requestKeyConflict",
    "mutationInflightOrAmbiguous",
    "mutationResolvedApplied",
    "resolutionClaimChanged",
  ]) {
    if (typeof adapter.codes?.[name] !== "string" || !adapter.codes[name]) {
      throw new TypeError(`Mutation-ledger conformance adapter requires codes.${name}.`);
    }
  }
}

class FakeMutationProvider {
  id = "local";
  calls = 0;
  error = undefined;

  async connect() {}
  async close() {}
  async listTools() {
    return [{
      provider: this.id,
      name: "edit",
      inputSchema: { type: "object" },
      sideEffect: "write",
      destructive: true,
      idempotent: false,
      openWorld: false,
    }];
  }
  async call(tool, input) {
    this.calls += 1;
    if (this.error) throw this.error;
    return { tool, input, call: this.calls };
  }
}

export function registerMutationLedgerConformanceTests(adapter) {
  validateAdapter(adapter);
  const {
    createBroker,
    createLedger,
    canonicalCallSignature,
    createError,
    isErrorCode,
    codes,
  } = adapter;

  async function temporaryLedgerPath(t) {
    const directory = await mkdtemp(join(tmpdir(), adapter.fixturePrefix));
    t.after(async () => rm(directory, { recursive: true, force: true }));
    return join(directory, "ledger.sqlite");
  }

  test("replays a successful mutation after the broker and database are reopened", async (t) => {
    const path = await temporaryLedgerPath(t);
    const firstProvider = new FakeMutationProvider();
    const firstBroker = createBroker([firstProvider], createLedger(path));
    const request = {
      tool: "edit",
      input: { path: "a.txt", text: "hello" },
      requestKey: "durable-success-1",
    };
    const first = await firstBroker.execute(request);
    await firstBroker.close();

    const secondProvider = new FakeMutationProvider();
    const secondBroker = createBroker([secondProvider], createLedger(path));
    const replay = await secondBroker.execute({
      ...request,
      input: { text: "hello", path: "a.txt" },
    });
    await secondBroker.close();

    assert.equal(firstProvider.calls, 1);
    assert.equal(secondProvider.calls, 0);
    assert.equal(replay.replayed, true);
    assert.equal(replay.originRequestId, first.requestId);
  });

  test("rejects a durable request-key conflict before provider launch", async (t) => {
    const path = await temporaryLedgerPath(t);
    const firstBroker = createBroker([new FakeMutationProvider()], createLedger(path));
    await firstBroker.execute({
      tool: "edit",
      input: { path: "a.txt", text: "one" },
      requestKey: "durable-conflict-1",
    });
    await firstBroker.close();

    const provider = new FakeMutationProvider();
    const secondBroker = createBroker([provider], createLedger(path));
    await assert.rejects(
      secondBroker.execute({
        tool: "edit",
        input: { path: "a.txt", text: "two" },
        requestKey: "durable-conflict-1",
      }),
      (error) => isErrorCode(error, codes.requestKeyConflict),
    );
    await secondBroker.close();
    assert.equal(provider.calls, 0);
  });

  test("blocks a durable inflight claim after a simulated process crash", async (t) => {
    const path = await temporaryLedgerPath(t);
    const ledger = createLedger(path);
    const input = { path: "a.txt", text: "hello" };
    await ledger.claim({
      requestKey: "durable-crash-1",
      signature: canonicalCallSignature("local", "edit", input),
      provider: "local",
      tool: "edit",
      sideEffect: "write",
      requestId: "25c5c81f-7f80-4399-86a3-476741f96754",
      startedAt: new Date().toISOString(),
    });
    await ledger.close();

    const provider = new FakeMutationProvider();
    const broker = createBroker([provider], createLedger(path));
    await assert.rejects(
      broker.execute({ tool: "edit", input, requestKey: "durable-crash-1" }),
      (error) => isErrorCode(error, codes.mutationInflightOrAmbiguous),
    );
    await broker.close();
    assert.equal(provider.calls, 0);
  });

  test("allows only one execution claim across independent SQLite connections", async (t) => {
    const path = await temporaryLedgerPath(t);
    const first = createLedger(path);
    const second = createLedger(path);
    const input = { path: "a.txt", text: "hello" };
    const signature = canonicalCallSignature("local", "edit", input);
    const firstClaim = await first.claim({
      requestKey: "concurrent-connections-1",
      signature,
      provider: "local",
      tool: "edit",
      sideEffect: "write",
      requestId: "9c82eb49-0732-45c9-b8de-64a8f9df315f",
      startedAt: new Date().toISOString(),
    });
    const secondClaim = await second.claim({
      requestKey: "concurrent-connections-1",
      signature,
      provider: "local",
      tool: "edit",
      sideEffect: "write",
      requestId: "bfe521d7-c119-4ab8-a1df-065c0479e894",
      startedAt: new Date().toISOString(),
    });
    await first.close();
    await second.close();

    assert.equal(firstClaim.action, "execute");
    assert.equal(secondClaim.action, "blocked");
    assert.equal(secondClaim.receipt.requestId, "9c82eb49-0732-45c9-b8de-64a8f9df315f");
  });

  test("allows retry across brokers only after a provider-confirmed not-applied failure", async (t) => {
    const path = await temporaryLedgerPath(t);
    const firstProvider = new FakeMutationProvider();
    firstProvider.error = createError("PROVIDER_REJECTED", "Rejected before launch.", {
      operationApplied: "no",
    });
    const firstBroker = createBroker([firstProvider], createLedger(path));
    const request = {
      tool: "edit",
      input: { path: "a.txt", text: "hello" },
      requestKey: "durable-retry-1",
    };
    await assert.rejects(firstBroker.execute(request), /Rejected before launch/u);
    await firstBroker.close();

    const secondProvider = new FakeMutationProvider();
    const secondBroker = createBroker([secondProvider], createLedger(path));
    const result = await secondBroker.execute(request);
    const receiptLedger = createLedger(path);
    const receipt = await receiptLedger.get(request.requestKey);
    await receiptLedger.close();
    await secondBroker.close();

    assert.equal(secondProvider.calls, 1);
    assert.equal(result.replayed, false);
    assert.equal(receipt?.state, "succeeded");
    assert.equal(receipt?.attempt, 2);
  });

  test("manual reconciliation records evidence and controls whether retry is allowed", async (t) => {
    const path = await temporaryLedgerPath(t);
    const input = { path: "a.txt", text: "hello" };
    const signature = canonicalCallSignature("local", "edit", input);
    const ledger = createLedger(path);
    await ledger.claim({
      requestKey: "manual-not-applied-1",
      signature,
      provider: "local",
      tool: "edit",
      sideEffect: "write",
      requestId: "5b8959d4-6d5e-4bdc-82d6-7cbda1f6ac85",
      startedAt: new Date().toISOString(),
    });
    const resolved = await ledger.resolve({
      requestKey: "manual-not-applied-1",
      requestId: "5b8959d4-6d5e-4bdc-82d6-7cbda1f6ac85",
      outcome: "not-applied",
      reason: "Provider audit showed no matching mutation receipt.",
    });
    await ledger.close();
    assert.equal(resolved.operationApplied, "no");
    assert.equal(resolved.resolutionReason, "Provider audit showed no matching mutation receipt.");

    const retryProvider = new FakeMutationProvider();
    const retryBroker = createBroker([retryProvider], createLedger(path));
    await retryBroker.execute({ tool: "edit", input, requestKey: "manual-not-applied-1" });
    await retryBroker.close();
    assert.equal(retryProvider.calls, 1);

    const appliedLedger = createLedger(path);
    await appliedLedger.claim({
      requestKey: "manual-applied-1",
      signature,
      provider: "local",
      tool: "edit",
      sideEffect: "write",
      requestId: "0d7693df-07f7-4bf2-84c3-578918116af3",
      startedAt: new Date().toISOString(),
    });
    await appliedLedger.resolve({
      requestKey: "manual-applied-1",
      requestId: "0d7693df-07f7-4bf2-84c3-578918116af3",
      outcome: "applied",
      reason: "Provider receipt confirmed the write completed.",
    });
    await appliedLedger.close();

    const blockedProvider = new FakeMutationProvider();
    const blockedBroker = createBroker([blockedProvider], createLedger(path));
    await assert.rejects(
      blockedBroker.execute({ tool: "edit", input, requestKey: "manual-applied-1" }),
      (error) => isErrorCode(error, codes.mutationResolvedApplied),
    );
    await blockedBroker.close();
    assert.equal(blockedProvider.calls, 0);
  });

  test("manual reconciliation is CAS-bound to the exact mutation attempt", async (t) => {
    const path = await temporaryLedgerPath(t);
    const input = { path: "a.txt", text: "hello" };
    const signature = canonicalCallSignature("local", "edit", input);
    const ledger = createLedger(path);
    const firstRequestId = "3e478d7a-5851-49fb-87e6-fdaf4fd3e24c";
    const secondRequestId = "2e5d2f02-751f-4efd-b033-6eb5382b5f7c";
    await ledger.claim({
      requestKey: "manual-cas-1",
      signature,
      provider: "local",
      tool: "edit",
      sideEffect: "write",
      requestId: firstRequestId,
      startedAt: new Date().toISOString(),
    });
    await ledger.fail({
      requestKey: "manual-cas-1",
      signature,
      requestId: firstRequestId,
      error: createError("PROVIDER_REJECTED", "Not launched.", { operationApplied: "no" }),
      completedAt: new Date().toISOString(),
    });
    const retry = await ledger.claim({
      requestKey: "manual-cas-1",
      signature,
      provider: "local",
      tool: "edit",
      sideEffect: "write",
      requestId: secondRequestId,
      startedAt: new Date().toISOString(),
    });
    assert.equal(retry.action, "execute");
    assert.equal(retry.receipt.attempt, 2);

    await assert.rejects(
      ledger.resolve({
        requestKey: "manual-cas-1",
        requestId: firstRequestId,
        outcome: "not-applied",
        reason: "Evidence belongs to attempt one only.",
      }),
      (error) => isErrorCode(error, codes.resolutionClaimChanged),
    );
    const stillActive = await ledger.get("manual-cas-1");
    assert.equal(stillActive?.state, "inflight");
    assert.equal(stillActive?.requestId, secondRequestId);
    assert.equal(stillActive?.attempt, 2);

    const resolved = await ledger.resolve({
      requestKey: "manual-cas-1",
      requestId: secondRequestId,
      outcome: "not-applied",
      reason: "Evidence explicitly covers attempt two.",
    });
    assert.equal(resolved.state, "failed");
    assert.equal(resolved.operationApplied, "no");
    assert.equal(resolved.requestId, secondRequestId);
    await ledger.close();
  });
}
