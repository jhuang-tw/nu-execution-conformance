import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

export const workspaceRecoveryConformanceTestCount = 6;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Workspace-recovery conformance requires an adapter object.");
  }
  for (const name of [
    "createProvider",
    "buildLoadedPolicy",
    "createPolicyEngine",
    "createReceiptStore",
    "isError",
  ]) {
    if (typeof adapter[name] !== "function") {
      throw new TypeError(`Workspace-recovery conformance adapter requires ${name}().`);
    }
  }
  for (const name of ["fixtureParent", "fixturePrefix", "toolResultSchema"]) {
    if (typeof adapter[name] !== "string" || adapter[name].length === 0) {
      throw new TypeError(`Workspace-recovery conformance adapter requires ${name}.`);
    }
  }
  if (!/^[a-z0-9._-]+$/u.test(adapter.fixtureParent)) {
    throw new TypeError("Workspace-recovery conformance adapter requires a safe fixtureParent.");
  }
  if (!/^[a-z0-9][a-z0-9-]*-$/u.test(adapter.fixturePrefix)) {
    throw new TypeError("Workspace-recovery conformance adapter requires a safe fixturePrefix.");
  }
}

export function registerWorkspaceRecoveryConformanceTests(adapter) {
  validateAdapter(adapter);

  async function fixture(t) {
    const parent = join(process.cwd(), adapter.fixtureParent);
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(join(parent, adapter.fixturePrefix));
    const a = join(root, "execution-a");
    const b = join(root, "execution-b");
    await mkdir(a);
    await mkdir(b);
    await writeFile(join(a, "one.txt"), "before\n");
    const provider = adapter.createProvider({ roots: [root] });
    t.after(async () => {
      await provider.close();
      await rm(root, { recursive: true, force: true });
    });
    const descriptors = await provider.listTools();
    const loaded = adapter.buildLoadedPolicy({
      root,
      descriptors,
      allowed: {
        open_workspace: {
          capability: "workspace.inspect",
          requiredScope: "workspace.read",
          argumentPolicy: "open-workspace",
        },
        inspect_workspace: {
          capability: "workspace.inspect",
          requiredScope: "workspace.read",
          argumentPolicy: "workspace-read",
        },
        write: {
          capability: "workspace.write",
          requiredScope: "workspace.write",
          argumentPolicy: "workspace-write",
        },
        edit: {
          capability: "workspace.write",
          requiredScope: "workspace.write",
          argumentPolicy: "workspace-write",
        },
        apply_patch: {
          capability: "workspace.write",
          requiredScope: "workspace.write",
          argumentPolicy: "workspace-write",
        },
      },
      denied: {},
    });
    const identity = {
      clientId: "test",
      subject: "shared-subject",
      principalId: "test",
      profile: "public-workspace",
      policyHash: loaded.hash,
      scopes: ["workspace.read", "workspace.write"],
      trustedExecution: false,
    };
    const engine = await adapter.createPolicyEngine(loaded, "public-workspace");

    async function call(tool, input) {
      const binding = engine.resolveForCall(descriptors, tool, identity);
      const request = await engine.authorizeCall(binding, {
        provider: binding.descriptor.provider,
        tool,
        input: structuredClone(input),
        requestKey: randomUUID(),
      }, identity);
      const result = await provider.call(tool, request.input, { ownerKey: identity.subject });
      const now = new Date().toISOString();
      const envelope = {
        schema: adapter.toolResultSchema,
        requestId: randomUUID(),
        provider: binding.descriptor.provider,
        tool,
        signature: "a".repeat(64),
        sideEffect: binding.descriptor.sideEffect,
        replayed: false,
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        result,
      };
      await engine.observeResult(tool, request.input, identity, envelope);
      if (binding.policy.argumentPolicy === "workspace-write") {
        engine.rotatePublicWorkspaceToken(identity, request.input);
      }
      const projected = engine.projectPublicResult(identity, request.input, envelope, binding);
      return {
        ...projected.result,
        workspaceToken: projected.workspaceToken,
      };
    }

    return { root, a, b, provider, descriptors, engine, identity, call };
  }

  test("shared-subject unchanged reopen is observation and real mutation still fences old tokens", async (t) => {
    const f = await fixture(t);
    const a = await f.call("open_workspace", { path: f.a });
    const again = await f.call("open_workspace", { path: f.a });
    assert.equal(again.workspaceId, a.workspaceId);
    assert.equal(again.workspaceToken, a.workspaceToken);
    await f.call("inspect_workspace", { workspaceId: a.workspaceId });
    const reopened = await f.call("open_workspace", { path: f.a });
    assert.equal(reopened.workspaceToken, a.workspaceToken);
    const write = await f.call("write", {
      workspaceId: a.workspaceId,
      path: "one.txt",
      content: "changed\n",
      expectedWorkspaceToken: a.workspaceToken,
    });
    assert.notEqual(write.workspaceToken, a.workspaceToken);
    const fresh = await f.call("open_workspace", { path: f.a });
    assert.equal(fresh.workspaceToken, write.workspaceToken);
    await assert.rejects(
      f.call("write", {
        workspaceId: a.workspaceId,
        path: "one.txt",
        content: "lost update",
        expectedWorkspaceToken: a.workspaceToken,
      }),
      (error) => adapter.isError(error, "WORKSPACE_STALE", "no"),
    );
    assert.equal(await readFile(join(f.a, "one.txt"), "utf8"), "changed\n");
  });

  test("reopen after observed provider drift rotates rather than donating old authority", async (t) => {
    const f = await fixture(t);
    const a = await f.call("open_workspace", { path: f.a });
    await mkdir(join(f.a, "external-change"));
    const reopened = await f.call("open_workspace", { path: f.a });
    assert.notEqual(reopened.workspaceToken, a.workspaceToken);
    await assert.rejects(f.call("write", {
      workspaceId: a.workspaceId,
      path: "one.txt",
      content: "no",
      expectedWorkspaceToken: a.workspaceToken,
    }));
  });

  test("independent execution scratch workspaces do not invalidate each other", async (t) => {
    const f = await fixture(t);
    const a = await f.call("open_workspace", { path: f.a });
    const b = await f.call("open_workspace", { path: f.b });
    assert.notEqual(a.workspaceId, b.workspaceId);
    await Promise.all([
      f.call("write", {
        workspaceId: a.workspaceId,
        path: "payload.json",
        content: "{}",
        expectedWorkspaceToken: a.workspaceToken,
      }),
      f.call("write", {
        workspaceId: b.workspaceId,
        path: "payload.json",
        content: "[]",
        expectedWorkspaceToken: b.workspaceToken,
      }),
    ]);
    assert.equal(await readFile(join(f.a, "payload.json"), "utf8"), "{}");
    assert.equal(await readFile(join(f.b, "payload.json"), "utf8"), "[]");
  });

  test("receipt preview exact effect assertion and public apply-revert preserve complete byte identity", async (t) => {
    const f = await fixture(t);
    const a = await f.call("open_workspace", { path: f.a });
    const applied = await f.call("apply_patch", {
      workspaceId: a.workspaceId,
      expectedWorkspaceToken: a.workspaceToken,
      patch: "*** Begin Patch\n*** Update File: one.txt\n@@\n-before\n+after\n*** Add File: two.txt\n+new\n*** End Patch",
    });
    const preview = await f.call("inspect_workspace", {
      workspaceId: a.workspaceId,
      operationId: applied.operationId,
    });
    const receipt = preview.snapshot.operationReceipt;
    assert.equal(receipt.available, true);
    assert.equal(receipt.supportsExpectedPaths, true);
    assert.equal(receipt.retention, "PROCESS_MEMORY_TTL");
    assert.deepEqual(receipt.paths, ["one.txt", "two.txt"]);
    assert.ok(receipt.expiresAt);
    assert.ok(!JSON.stringify(receipt).includes('"content"'));
    for (const paths of [["one.txt"], ["one.txt", "two.txt", "extra.txt"], ["one.txt", "one.txt"]]) {
      await assert.rejects(
        f.call("edit", {
          workspaceId: a.workspaceId,
          action: "revert",
          operationId: applied.operationId,
          paths,
          expectedWorkspaceToken: preview.workspaceToken,
        }),
        (error) => adapter.isError(error, "RECEIPT_PATHS_MISMATCH", "no"),
      );
      assert.equal(await readFile(join(f.a, "one.txt"), "utf8"), "after\n");
    }
    const reverted = await f.call("edit", {
      workspaceId: a.workspaceId,
      action: "revert",
      operationId: applied.operationId,
      paths: receipt.paths,
      expectedWorkspaceToken: preview.workspaceToken,
    });
    assert.equal(reverted.reverted, true);
    assert.equal(await readFile(join(f.a, "one.txt"), "utf8"), "before\n");
    await assert.rejects(readFile(join(f.a, "two.txt")));
    const consumed = await f.call("inspect_workspace", {
      workspaceId: a.workspaceId,
      operationId: applied.operationId,
    });
    assert.equal(consumed.snapshot.operationReceipt.available, false);
    await assert.rejects(
      f.call("edit", {
        workspaceId: a.workspaceId,
        action: "revert",
        operationId: applied.operationId,
        paths: receipt.paths,
        expectedWorkspaceToken: consumed.workspaceToken,
      }),
      (error) => adapter.isError(error, "RECEIPT_MISSING", "no"),
    );
  });

  test("wrong workspace and malformed action schema do not consume receipts or change files", async (t) => {
    const f = await fixture(t);
    const a = await f.call("open_workspace", { path: f.a });
    const b = await f.call("open_workspace", { path: f.b });
    const changed = await f.call("edit", {
      workspaceId: a.workspaceId,
      path: "one.txt",
      edits: [{ oldText: "before", newText: "after" }],
      expectedWorkspaceToken: a.workspaceToken,
    });
    await assert.rejects(
      f.call("inspect_workspace", {
        workspaceId: b.workspaceId,
        operationId: changed.operationId,
      }),
      (error) => adapter.isError(error, "RECEIPT_WORKSPACE_MISMATCH"),
    );
    await assert.rejects(
      f.call("edit", {
        workspaceId: a.workspaceId,
        action: "revert",
        operationId: changed.operationId,
        path: "one.txt",
        expectedWorkspaceToken: changed.workspaceToken,
      }),
      (error) => adapter.isError(error, "NATIVE_INPUT_INVALID", "no"),
    );
    assert.equal(await readFile(join(f.a, "one.txt"), "utf8"), "after\n");
    const preview = await f.call("inspect_workspace", {
      workspaceId: a.workspaceId,
      operationId: changed.operationId,
    });
    assert.equal(preview.snapshot.operationReceipt.available, true);
  });

  test("expired and new-runtime receipt absence is observable without inventing restoration data", () => {
    const store = adapter.createReceiptStore({ ttlMs: 1000 });
    const reserved = store.reserve({
      workspaceId: "w",
      root: process.cwd(),
      source: "edit",
      files: [{
        path: "x.txt",
        before: { content: "secret-before", mode: 0o644 },
        after: { content: "after", mode: 0o644 },
      }],
    });
    store.activate(String(reserved.operationId));
    const input = {
      workspaceId: "w",
      root: process.cwd(),
      operationId: String(reserved.operationId),
    };
    assert.equal(store.inspect(input).available, true);
    assert.equal(adapter.createReceiptStore().inspect(input).available, false);
    const originalNow = Date.now;
    try {
      Date.now = () => originalNow() + 2000;
      assert.equal(store.inspect(input).available, false);
    } finally {
      Date.now = originalNow;
    }
  });
}
