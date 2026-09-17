import assert from "node:assert/strict";
import test from "node:test";

export const brokerConformanceTestCount = 14;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Broker conformance requires an adapter object.");
  }
  for (const name of ["createBroker", "createError", "isErrorCode"]) {
    if (typeof adapter[name] !== "function") {
      throw new TypeError(`Broker conformance adapter requires ${name}().`);
    }
  }
  const requiredCodes = ["requestKeyRequired", "requestKeyConflict", "ambiguousTool", "stopUnconfirmed"];
  for (const name of requiredCodes) {
    if (typeof adapter.codes?.[name] !== "string" || adapter.codes[name].length === 0) {
      throw new TypeError(`Broker conformance adapter requires codes.${name}.`);
    }
  }
}

function descriptor(name, sideEffect) {
  return {
    name,
    inputSchema: { type: "object" },
    sideEffect,
    destructive: sideEffect === "write",
    idempotent: false,
    openWorld: false,
  };
}

export function registerBrokerConformanceTests(adapter) {
  validateAdapter(adapter);
  const { createBroker, createError, isErrorCode, codes } = adapter;

  class FakeProvider {
    constructor(id, descriptors, options = {}) {
      this.id = id;
      this.startupMode = options.startupMode;
      this.descriptors = descriptors.map((entry) => ({ ...entry, provider: id }));
      this.calls = 0;
      this.delayMs = 0;
      this.error = undefined;
      this.connectError = undefined;
      this.listToolsError = undefined;
      this.closeError = undefined;
      this.connects = 0;
      this.closes = 0;
      this.toolsChangedHandler = undefined;
      this.optionsSeen = [];
    }

    async connect() {
      this.connects += 1;
      if (this.connectError) throw this.connectError;
    }

    async close() {
      this.closes += 1;
      if (this.closeError) throw this.closeError;
    }

    setToolsChangedHandler(handler) {
      this.toolsChangedHandler = handler;
    }

    notifyToolsChanged() {
      this.toolsChangedHandler?.();
    }

    async listTools() {
      if (this.listToolsError) throw this.listToolsError;
      return this.descriptors;
    }

    async call(tool, input, options) {
      this.calls += 1;
      this.optionsSeen.push(options);
      if (this.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }
      if (this.error) throw this.error;
      return { tool, input, call: this.calls };
    }
  }

  test("optional providers do not block startup when connect fails", async (t) => {
    const required = new FakeProvider("required", [descriptor("read", "read")]);
    const optional = new FakeProvider("optional", [descriptor("optional_read", "read")], { startupMode: "optional" });
    optional.connectError = new Error("optional provider is offline");
    const broker = createBroker([required, optional]);
    t.after(async () => broker.close());

    await broker.connect();
    assert.deepEqual(broker.listTools().map((tool) => tool.name), ["read"]);
    assert.equal(required.connects, 1);
    assert.equal(optional.connects, 1);
  });

  test("optional providers do not block inventory when tools/list fails", async (t) => {
    const required = new FakeProvider("required", [descriptor("read", "read")]);
    const optional = new FakeProvider("optional", [descriptor("optional_read", "read")], { startupMode: "optional" });
    optional.listToolsError = new Error("optional inventory unavailable");
    const broker = createBroker([required, optional]);
    t.after(async () => broker.close());

    await broker.connect();
    assert.deepEqual(broker.listTools().map((tool) => tool.name), ["read"]);
  });

  test("required providers still fail closed during startup and inventory", async (t) => {
    const connectFailure = new FakeProvider("required-connect", [descriptor("read", "read")]);
    connectFailure.connectError = new Error("required connect failed");
    const connectBroker = createBroker([connectFailure]);
    t.after(async () => connectBroker.close());
    await assert.rejects(connectBroker.connect(), /required connect failed/);

    const listFailure = new FakeProvider("required-list", [descriptor("read", "read")]);
    listFailure.listToolsError = new Error("required inventory failed");
    const listBroker = createBroker([listFailure]);
    t.after(async () => listBroker.close());
    await assert.rejects(listBroker.connect(), /required inventory failed/);
  });

  test("refreshes provider inventory only after a tool-list change signal", async () => {
    const provider = new FakeProvider("local", [descriptor("read", "read")]);
    const broker = createBroker([provider]);
    await broker.connect();
    assert.deepEqual(broker.listTools().map((tool) => tool.name), ["read"]);

    provider.descriptors.push({ ...descriptor("dynamic_read", "read"), provider: provider.id });
    assert.deepEqual(broker.listTools().map((tool) => tool.name), ["read"]);

    provider.notifyToolsChanged();
    const refreshed = await broker.ensureFreshTools();
    assert.deepEqual(refreshed.map((tool) => tool.name), ["dynamic_read", "read"]);
    await broker.close();
  });

  test("coalesces identical reads while they are in flight", async () => {
    const provider = new FakeProvider("local", [descriptor("read", "read")]);
    provider.delayMs = 20;
    const broker = createBroker([provider]);
    const [first, second] = await Promise.all([
      broker.execute({ tool: "read", input: { path: "a.txt" } }),
      broker.execute({ tool: "read", input: { path: "a.txt" } }),
    ]);

    assert.equal(provider.calls, 1);
    assert.equal(provider.connects, 1);
    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
    assert.equal(second.originRequestId, first.requestId);
    assert.equal(broker.snapshot().readSingleflightJoins, 1);
  });

  test("internal owner context reaches providers and prevents cross-owner read singleflight", async () => {
    const provider = new FakeProvider("local", [descriptor("read", "read")]);
    provider.delayMs = 20;
    const broker = createBroker([provider]);
    const input = { path: "same.txt" };
    const [first, second] = await Promise.all([
      broker.execute({ tool: "read", input }, undefined, undefined, { ownerKey: "owner-a" }),
      broker.execute({ tool: "read", input }, undefined, undefined, { ownerKey: "owner-b" }),
    ]);

    assert.equal(provider.calls, 2);
    assert.deepEqual(provider.optionsSeen.map((entry) => entry?.ownerKey).sort(), ["owner-a", "owner-b"]);
    assert.equal(first.signature, second.signature, "Internal owner context must not alter the public canonical signature.");
    assert.equal(broker.snapshot().readSingleflightJoins, 0);
  });

  test("provider session context prevents cross-session read singleflight for the same owner", async () => {
    const provider = new FakeProvider("browser", [descriptor("snapshot", "read")]);
    provider.delayMs = 20;
    const broker = createBroker([provider]);
    const input = { fullPage: false };
    const [first, second] = await Promise.all([
      broker.execute(
        { tool: "snapshot", input },
        undefined,
        undefined,
        { ownerKey: "same-owner", providerSessionKey: "browser-session-a" },
      ),
      broker.execute(
        { tool: "snapshot", input },
        undefined,
        undefined,
        { ownerKey: "same-owner", providerSessionKey: "browser-session-b" },
      ),
    ]);

    assert.equal(provider.calls, 2);
    assert.deepEqual(
      provider.optionsSeen.map((entry) => entry?.providerSessionKey).sort(),
      ["browser-session-a", "browser-session-b"],
    );
    assert.equal(first.signature, second.signature, "Internal provider session context must not alter the public canonical signature.");
    assert.equal(broker.snapshot().readSingleflightJoins, 0);
  });

  test("requires request keys for writes and unknown side effects", async () => {
    const provider = new FakeProvider("local", [
      descriptor("edit", "write"),
      descriptor("mystery", "unknown"),
    ]);
    const broker = createBroker([provider]);

    await assert.rejects(
      broker.execute({ tool: "edit", input: { path: "a.txt" } }),
      (error) => isErrorCode(error, codes.requestKeyRequired),
    );
    await assert.rejects(
      broker.execute({ tool: "mystery", input: {} }),
      (error) => isErrorCode(error, codes.requestKeyRequired),
    );
    assert.equal(provider.calls, 0);
  });

  test("replays an exact mutation request key without launching twice", async () => {
    const provider = new FakeProvider("local", [descriptor("edit", "write")]);
    const broker = createBroker([provider]);
    const first = await broker.execute({
      tool: "edit",
      input: { path: "a.txt", text: "hello" },
      requestKey: "issue-1-edit-1",
    });
    const replay = await broker.execute({
      tool: "edit",
      input: { text: "hello", path: "a.txt" },
      requestKey: "issue-1-edit-1",
    });

    assert.equal(provider.calls, 1);
    assert.equal(replay.replayed, true);
    assert.equal(replay.originRequestId, first.requestId);
    assert.equal(broker.snapshot().mutationReplays, 1);
  });

  test("rejects request key reuse for a different canonical call", async () => {
    const provider = new FakeProvider("local", [descriptor("edit", "write")]);
    const broker = createBroker([provider]);
    await broker.execute({
      tool: "edit",
      input: { path: "a.txt", text: "one" },
      requestKey: "issue-1-edit-1",
    });

    await assert.rejects(
      broker.execute({
        tool: "edit",
        input: { path: "a.txt", text: "two" },
        requestKey: "issue-1-edit-1",
      }),
      (error) => isErrorCode(error, codes.requestKeyConflict),
    );
    assert.equal(provider.calls, 1);
    assert.equal(broker.snapshot().requestKeyConflicts, 1);
  });

  test("keeps an ambiguous failed mutation bound to its request key", async () => {
    const provider = new FakeProvider("local", [descriptor("edit", "write")]);
    provider.error = createError("PROVIDER_TIMEOUT", "Response was lost.", {
      operationApplied: "unknown",
    });
    const broker = createBroker([provider]);
    const request = {
      tool: "edit",
      input: { path: "a.txt", text: "hello" },
      requestKey: "issue-2-edit-1",
    };

    await assert.rejects(broker.execute(request), /Response was lost/);
    await assert.rejects(broker.execute(request), /Response was lost/);

    assert.equal(provider.calls, 1);
    assert.equal(broker.snapshot().mutationReplays, 1);
  });

  test("allows a proven-not-applied mutation to retry with the same request key", async () => {
    const provider = new FakeProvider("local", [descriptor("edit", "write")]);
    provider.error = createError("PROVIDER_REJECTED", "Rejected before launch.", {
      operationApplied: "no",
    });
    const broker = createBroker([provider]);
    const request = {
      tool: "edit",
      input: { path: "a.txt", text: "hello" },
      requestKey: "issue-3-edit-1",
    };

    await assert.rejects(broker.execute(request), /Rejected before launch/);
    provider.error = undefined;
    const result = await broker.execute(request);

    assert.equal(result.replayed, false);
    assert.equal(provider.calls, 2);
  });

  test("requires explicit provider selection for duplicate tool names", async () => {
    const first = new FakeProvider("first", [descriptor("read", "read")]);
    const second = new FakeProvider("second", [descriptor("read", "read")]);
    const broker = createBroker([first, second]);

    await assert.rejects(
      broker.execute({ tool: "read", input: {} }),
      (error) => isErrorCode(error, codes.ambiguousTool),
    );
    const result = await broker.execute({ tool: "read", provider: "second", input: {} });
    assert.equal(result.provider, "second");
    assert.equal(first.calls, 0);
    assert.equal(second.calls, 1);
  });

  test("broker close propagates provider teardown failure after attempting every provider", async () => {
    const first = new FakeProvider("first", [descriptor("read-a", "read")]);
    const second = new FakeProvider("second", [descriptor("read-b", "read")]);
    first.closeError = createError(
      codes.stopUnconfirmed,
      "Process tree stop could not be confirmed.",
      { operationApplied: "unknown" },
    );
    const broker = createBroker([first, second]);

    await assert.rejects(
      broker.close(),
      (error) => isErrorCode(error, codes.stopUnconfirmed),
    );
    assert.equal(first.closes, 1);
    assert.equal(second.closes, 1, "A teardown failure must not prevent other providers from closing.");
  });
}
