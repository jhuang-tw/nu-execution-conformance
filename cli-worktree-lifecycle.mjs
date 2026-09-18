import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

export const cliWorktreeLifecycleConformanceTestCount = 1;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("CLI-worktree-lifecycle conformance requires an adapter object.");
  }
  for (const name of ["createDefaultConfig", "saveConfig"]) {
    if (typeof adapter[name] !== "function") {
      throw new TypeError(`CLI-worktree-lifecycle conformance adapter requires ${name}().`);
    }
  }
  for (const name of [
    "productName",
    "productId",
    "fixturePrefix",
    "cliPath",
    "configEnv",
    "stateEnv",
    "ledgerEnv",
    "errorCode",
  ]) {
    if (typeof adapter[name] !== "string" || adapter[name].length === 0) {
      throw new TypeError(`CLI-worktree-lifecycle conformance adapter requires ${name}.`);
    }
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(adapter.productName)) {
    throw new TypeError("CLI-worktree-lifecycle conformance adapter requires a safe productName.");
  }
  if (!/^[a-z][a-z0-9-]*$/u.test(adapter.productId)) {
    throw new TypeError("CLI-worktree-lifecycle conformance adapter requires a safe productId.");
  }
  for (const name of ["configEnv", "stateEnv", "ledgerEnv"]) {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(adapter[name])) {
      throw new TypeError(`CLI-worktree-lifecycle conformance adapter requires a safe ${name}.`);
    }
  }
}

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

export function registerCliWorktreeLifecycleConformanceTests(adapter) {
  validateAdapter(adapter);

  test("direct CLI open_worktree fails before filesystem mutation and requires a persistent runtime", async (t) => {
    const base = await mkdtemp(join(tmpdir(), adapter.fixturePrefix));
    const source = join(base, "repo");
    const configFile = join(base, "config.json");
    const stateDir = join(base, "state");
    t.after(async () => rm(base, { recursive: true, force: true }));

    await mkdir(source);
    git(source, "init");
    git(source, "config", "user.email", `${adapter.productId}-test@example.invalid`);
    git(source, "config", "user.name", `${adapter.productName} Test`);
    await writeFile(join(source, "README.md"), "base\n", "utf8");
    git(source, "add", "README.md");
    git(source, "commit", "-m", "base");
    await adapter.saveConfig(
      configFile,
      adapter.createDefaultConfig({ roots: [base] }),
    );

    const before = git(source, "worktree", "list", "--porcelain");
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        adapter.cliPath,
        "call",
        "open_worktree",
        "--args",
        JSON.stringify({ path: source, baseRef: "HEAD" }),
        "--request-key",
        "direct-cli-worktree-must-not-launch",
        "--json",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          [adapter.configEnv]: configFile,
          [adapter.stateEnv]: stateDir,
          [adapter.ledgerEnv]: join(stateDir, "ledger.sqlite"),
        },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    const after = git(source, "worktree", "list", "--porcelain");

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const error = JSON.parse(result.stdout);
    assert.equal(error.code, adapter.errorCode);
    assert.match(
      error.message ?? "",
      new RegExp(`persistent ${adapter.productName} runtime`, "i"),
    );
    assert.match(error.message ?? "", /--daemon|MCP gateway/i);
    assert.equal(error.operationApplied, "no");
    assert.equal(
      after,
      before,
      "direct CLI rejection must not register or create a managed worktree",
    );
  });
}
