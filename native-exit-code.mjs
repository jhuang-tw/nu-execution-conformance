import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

export const nativeExitCodeConformanceTestCount = 4;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Native exit-code conformance requires an adapter object.");
  }
  if (typeof adapter.createProvider !== "function") {
    throw new TypeError("Native exit-code conformance adapter requires createProvider().");
  }
  if (typeof adapter.fixturePrefix !== "string" || !adapter.fixturePrefix.trim()
    || /[\\/]/u.test(adapter.fixturePrefix)) {
    throw new TypeError("Native exit-code conformance adapter requires a safe fixturePrefix.");
  }
  if (process.platform === "win32"
    && (typeof adapter.windowsFixtureBase !== "string" || !adapter.windowsFixtureBase.trim())) {
    throw new TypeError("Native exit-code conformance adapter requires windowsFixtureBase on Windows.");
  }
}

export function registerNativeExitCodeConformanceTests(adapter) {
  validateAdapter(adapter);

  async function withProvider(t) {
    const fixtureBase = process.platform === "win32" ? adapter.windowsFixtureBase : tmpdir();
    await mkdir(fixtureBase, { recursive: true });
    const root = await mkdtemp(join(fixtureBase, adapter.fixturePrefix));
    const project = join(root, "project");
    await mkdir(project, { recursive: true });
    const provider = adapter.createProvider({ roots: [root], commandTimeoutMs: 10_000 });
    const opened = await provider.call("open_workspace", { path: project, mode: "checkout" });
    t.after(async () => {
      await provider.close();
      await rm(root, { recursive: true, force: true, maxRetries: 15, retryDelay: 100 });
    });
    return { provider, workspaceId: opened.workspaceId };
  }

  async function exec(provider, workspaceId, shell, command) {
    return await provider.call("exec_command", {
      workspaceId,
      shell,
      command,
      timeoutMs: 10_000,
    });
  }

  test("PowerShell transport preserves final success/failure and native exit codes", { skip: process.platform !== "win32" }, async (t) => {
    const { provider, workspaceId } = await withProvider(t);
    for (const code of [0, 1, 7]) {
      const result = await exec(provider, workspaceId, "powershell", `node -e "process.exit(${code})"`);
      assert.equal(result.exitCode, code, `PowerShell must preserve native child exit ${code}.`);
      assert.equal(result.timedOut, false);
    }

    const thrown = await exec(provider, workspaceId, "powershell", "throw 'nu-exit-conformance'");
    assert.notEqual(thrown.exitCode, 0, "PowerShell throw must fail the transport process.");

    const missing = await exec(provider, workspaceId, "powershell", "nu_missing_command_conformance_20260917");
    assert.notEqual(missing.exitCode, 0, "Missing PowerShell command must fail the transport process.");

    const terminating = await exec(
      provider,
      workspaceId,
      "powershell",
      "Write-Error 'nu-terminating-error' -ErrorAction Stop",
    );
    assert.notEqual(terminating.exitCode, 0, "Terminating PowerShell error must fail the transport process.");
  });

  test("Bash transport preserves 0/1/7 and missing-command exit status", async (t) => {
    const { provider, workspaceId } = await withProvider(t);
    for (const code of [0, 1, 7]) {
      const result = await exec(provider, workspaceId, "bash", `exit ${code}`);
      assert.equal(result.exitCode, code, `Bash must preserve exit ${code}.`);
      assert.equal(result.timedOut, false);
    }
    const missing = await exec(provider, workspaceId, "bash", "nu_missing_command_conformance_20260917");
    assert.notEqual(missing.exitCode, 0, "Missing Bash command must fail the transport process.");
  });

  test("CMD transport preserves 0/1/7 and invalid-command exit status", { skip: process.platform !== "win32" }, async (t) => {
    const { provider, workspaceId } = await withProvider(t);
    for (const code of [0, 1, 7]) {
      const result = await exec(provider, workspaceId, "cmd", `exit /b ${code}`);
      assert.equal(result.exitCode, code, `CMD must preserve native exit ${code}.`);
      assert.equal(result.timedOut, false);
    }
    const quotedInline = await exec(provider, workspaceId, "cmd", `node -e "console.log('nu-cmd-quote-ok')"`);
    assert.equal(quotedInline.exitCode, 0);
    assert.equal(quotedInline.stdout.trim(), "nu-cmd-quote-ok", "CMD must preserve quotes around inline code arguments.");

    const quotedExit = await exec(provider, workspaceId, "cmd", `node -e "process.exit(7)"`);
    assert.equal(quotedExit.exitCode, 7, "CMD must not turn a quoted inline program into a no-op string literal.");

    const missing = await exec(provider, workspaceId, "cmd", "nu_missing_command_conformance_20260917");
    assert.notEqual(missing.exitCode, 0, "Invalid CMD command must fail the transport process.");
  });

  test("CMD run_checks preserves quoted inline-code arguments", { skip: process.platform !== "win32" }, async (t) => {
    const { provider, workspaceId } = await withProvider(t);
    const result = await provider.call("run_checks", {
      workspaceId,
      checks: [{
        name: "cmd-inline-code",
        shell: "cmd",
        command: `node -e "console.log('nu-run-checks-cmd-quote-ok')"`,
        timeoutMs: 10_000,
      }],
      detail: "full",
    });
    assert.equal(result.passed, true);
    assert.equal(result.results[0]?.attempts[0]?.exitCode, 0);
    assert.equal(result.results[0]?.attempts[0]?.stdout.trim(), "nu-run-checks-cmd-quote-ok");
  });
}
