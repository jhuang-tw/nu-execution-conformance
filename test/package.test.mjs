import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  brokerConformanceTestCount,
  registerBrokerConformanceTests,
} from "../broker.mjs";
import {
  redactionConformanceTestCount,
  registerRedactionConformanceTests,
} from "../redaction.mjs";
import {
  errorContractConformanceTestCount,
  registerErrorContractConformanceTests,
} from "../error-contract.mjs";
import {
  nativeExitCodeConformanceTestCount,
  registerNativeExitCodeConformanceTests,
} from "../native-exit-code.mjs";
import {
  mutationLedgerConformanceTestCount,
  registerMutationLedgerConformanceTests,
} from "../mutation-ledger.mjs";
import {
  operationStageConformanceTestCount,
  registerOperationStageConformanceTests,
} from "../operation-stage.mjs";
import {
  processSessionConformanceTestCount,
  registerProcessSessionConformanceTests,
} from "../process-session.mjs";
import {
  registerResourceAdmissionConformanceTests,
  resourceAdmissionConformanceTestCount,
} from "../resource-admission.mjs";
import {
  publicTunnelConformanceTestCount,
  registerPublicTunnelConformanceTests,
} from "../public-tunnel.mjs";
import {
  auditClassificationConformanceTestCount,
  registerAuditClassificationConformanceTests,
} from "../audit-classification.mjs";
import {
  nativePatchParentConformanceTestCount,
  registerNativePatchParentConformanceTests,
} from "../native-patch-parent.mjs";
import {
  oauthProviderConformanceTestCount,
  registerOAuthProviderConformanceTests,
} from "../oauth-provider.mjs";
import {
  registerWindowsHiddenProcessConformanceTests,
  windowsHiddenProcessConformanceTestCount,
} from "../windows-hidden-process.mjs";
import {
  registerWorkspaceRecoveryConformanceTests,
  workspaceRecoveryConformanceTestCount,
} from "../workspace-recovery.mjs";
import {
  registerReleaseContractConformanceTests,
  releaseContractConformanceTestCount,
} from "../release-contract.mjs";
import {
  cliWorktreeLifecycleConformanceTestCount,
  registerCliWorktreeLifecycleConformanceTests,
} from "../cli-worktree-lifecycle.mjs";

test("broker conformance exports one bounded fourteen-test contract", async () => {
  assert.equal(brokerConformanceTestCount, 14);
  const source = await readFile(new URL("../broker.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/\btest\("/gu) ?? []).length, brokerConformanceTestCount);
});

test("redaction conformance exports one bounded two-test contract", async () => {
  assert.equal(redactionConformanceTestCount, 2);
  const source = await readFile(new URL("../redaction.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/\btest\("/gu) ?? []).length, redactionConformanceTestCount);
});

test("error-contract conformance exports one bounded six-test contract", async () => {
  assert.equal(errorContractConformanceTestCount, 6);
  const source = await readFile(new URL("../error-contract.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/\btest\("/gu) ?? []).length, errorContractConformanceTestCount);
});

test("native exit-code conformance exports one bounded four-test contract", async () => {
  assert.equal(nativeExitCodeConformanceTestCount, 4);
  const source = await readFile(new URL("../native-exit-code.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/\btest\("/gu) ?? []).length, nativeExitCodeConformanceTestCount);
});

test("mutation-ledger conformance exports one bounded seven-test contract", async () => {
  assert.equal(mutationLedgerConformanceTestCount, 7);
  const source = await readFile(new URL("../mutation-ledger.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/\btest\("/gu) ?? []).length, mutationLedgerConformanceTestCount);
});

test("operation-stage conformance exports one bounded eight-test contract", async () => {
  assert.equal(operationStageConformanceTestCount, 8);
  const source = await readFile(new URL("../operation-stage.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/\btest\("/gu) ?? []).length, operationStageConformanceTestCount);
});

test("process-session conformance exports one bounded five-test contract", async () => {
  assert.equal(processSessionConformanceTestCount, 5);
  const source = await readFile(new URL("../process-session.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/\btest\("/gu) ?? []).length, processSessionConformanceTestCount);
});

test("resource-admission conformance exports one bounded three-test contract", async () => {
  assert.equal(resourceAdmissionConformanceTestCount, 3);
  const source = await readFile(new URL("../resource-admission.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/\btest\("/gu) ?? []).length, resourceAdmissionConformanceTestCount);
});

test("public-tunnel conformance exports one bounded four-test contract", async () => {
  assert.equal(publicTunnelConformanceTestCount, 4);
  const source = await readFile(new URL("../public-tunnel.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/\btest\(/gu) ?? []).length, publicTunnelConformanceTestCount);
});

test("audit-classification conformance exports one bounded one-test contract", async () => {
  assert.equal(auditClassificationConformanceTestCount, 1);
  const source = await readFile(new URL("../audit-classification.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/^\s*test\(/gmu) ?? []).length, auditClassificationConformanceTestCount);
});

test("native-patch-parent conformance exports one bounded two-test contract", async () => {
  assert.equal(nativePatchParentConformanceTestCount, 2);
  const source = await readFile(new URL("../native-patch-parent.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/^\s*test\(/gmu) ?? []).length, nativePatchParentConformanceTestCount);
});

test("oauth-provider conformance exports one bounded three-test contract", async () => {
  assert.equal(oauthProviderConformanceTestCount, 3);
  const source = await readFile(new URL("../oauth-provider.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/^\s*test\(/gmu) ?? []).length, oauthProviderConformanceTestCount);
});

test("windows-hidden-process conformance exports one bounded one-test contract", async () => {
  assert.equal(windowsHiddenProcessConformanceTestCount, 1);
  const source = await readFile(new URL("../windows-hidden-process.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/\btest\(/gu) ?? []).length, windowsHiddenProcessConformanceTestCount);
  assert.equal(typeof registerWindowsHiddenProcessConformanceTests, "function");
});

test("workspace-recovery conformance exports one bounded six-test contract", async () => {
  assert.equal(workspaceRecoveryConformanceTestCount, 6);
  const source = await readFile(new URL("../workspace-recovery.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/^\s*test\(/gmu) ?? []).length, workspaceRecoveryConformanceTestCount);
});

test("release-contract conformance exports one bounded one-test contract", async () => {
  assert.equal(releaseContractConformanceTestCount, 1);
  const source = await readFile(new URL("../release-contract.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/^\s*test\(/gmu) ?? []).length, releaseContractConformanceTestCount);
});

test("cli-worktree-lifecycle conformance exports one bounded one-test contract", async () => {
  assert.equal(cliWorktreeLifecycleConformanceTestCount, 1);
  const source = await readFile(new URL("../cli-worktree-lifecycle.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/^\s*test\(/gmu) ?? []).length, cliWorktreeLifecycleConformanceTestCount);
});

test("shared deterministic conformance remains product-neutral and runtime-free", async () => {
  const sources = await Promise.all([
    "../broker.mjs",
    "../redaction.mjs",
    "../error-contract.mjs",
    "../native-exit-code.mjs",
    "../mutation-ledger.mjs",
    "../operation-stage.mjs",
    "../process-session.mjs",
    "../resource-admission.mjs",
    "../public-tunnel.mjs",
    "../audit-classification.mjs",
    "../native-patch-parent.mjs",
    "../oauth-provider.mjs",
    "../windows-hidden-process.mjs",
    "../workspace-recovery.mjs",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const source of sources) {
    assert.doesNotMatch(source, /\b(?:Ternu|Vyrnu|Zenu|Aernu)\b/u);
    assert.doesNotMatch(source, /(?:child_process|worker_threads|express|modelcontextprotocol)/u);
  }
  assert.doesNotMatch(sources[0], /(?:http:|https:)/u);
});

test("bounded process-backed conformance remains product-neutral", async () => {
  const sources = await Promise.all([
    "../release-contract.mjs",
    "../cli-worktree-lifecycle.mjs",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const source of sources) {
    assert.doesNotMatch(source, /\b(?:Ternu|Vyrnu|Zenu|Aernu)\b/u);
    assert.doesNotMatch(source, /(?:worker_threads|express|modelcontextprotocol)/u);
    assert.match(source, /node:child_process/u);
  }
});

test("invalid broker adapters fail before any conformance tests are registered", () => {
  assert.throws(() => registerBrokerConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerBrokerConformanceTests({}), /createBroker/u);
  assert.throws(
    () => registerBrokerConformanceTests({
      createBroker() {},
      createError() {},
      isErrorCode() {},
      codes: {},
    }),
    /codes\.requestKeyRequired/u,
  );
});

test("invalid redaction adapters fail before any conformance tests are registered", () => {
  assert.throws(() => registerRedactionConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerRedactionConformanceTests({}), /redactString/u);
  assert.throws(
    () => registerRedactionConformanceTests({
      redactString() {},
      redactValue() {},
    }),
    /createAuditSink/u,
  );
});

test("invalid error-contract adapters fail before any conformance tests are registered", () => {
  assert.throws(() => registerErrorContractConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerErrorContractConformanceTests({}), /normalize/u);
  assert.throws(
    () => registerErrorContractConformanceTests({ normalize() {} }),
    /createError/u,
  );
});

test("invalid native exit-code adapters fail before any conformance tests are registered", () => {
  assert.throws(() => registerNativeExitCodeConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerNativeExitCodeConformanceTests({}), /createProvider/u);
  assert.throws(
    () => registerNativeExitCodeConformanceTests({
      createProvider() {},
      fixturePrefix: "../unsafe",
      windowsFixtureBase: "C:\\fixture",
    }),
    /fixturePrefix/u,
  );
});

test("invalid mutation-ledger adapters fail before any conformance tests are registered", () => {
  assert.throws(() => registerMutationLedgerConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerMutationLedgerConformanceTests({}), /createBroker/u);
  assert.throws(
    () => registerMutationLedgerConformanceTests({
      createBroker() {},
      createLedger() {},
      canonicalCallSignature() {},
      createError() {},
      isErrorCode() {},
      fixturePrefix: "../unsafe",
      codes: {},
    }),
    /fixturePrefix/u,
  );
  assert.throws(
    () => registerMutationLedgerConformanceTests({
      createBroker() {},
      createLedger() {},
      canonicalCallSignature() {},
      createError() {},
      isErrorCode() {},
      fixturePrefix: "nu-ledger-test-",
      codes: {},
    }),
    /codes\.requestKeyConflict/u,
  );
});

test("invalid operation-stage adapters fail before any conformance tests are registered", () => {
  assert.throws(() => registerOperationStageConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerOperationStageConformanceTests({}), /createBroker/u);
  assert.throws(
    () => registerOperationStageConformanceTests({
      createBroker() {},
      createMemoryMutationLedger() {},
      createMemoryStore() {},
      createSqliteStore() {},
      createError() {},
      isErrorCode() {},
      projectRuntimeSummary() {},
      codes: {},
      operationStageSchema: "nu.operation_stage_snapshot.v1",
    }),
    /codes\.stageTestFailure/u,
  );
});

test("invalid process-session adapters fail before any conformance tests are registered", () => {
  assert.throws(() => registerProcessSessionConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerProcessSessionConformanceTests({}), /createStore/u);
  assert.throws(
    () => registerProcessSessionConformanceTests({
      createStore() {},
      isErrorCode() {},
      codes: {},
    }),
    /codes\.stopUnconfirmed/u,
  );
});

test("invalid resource-admission adapters fail before any conformance tests are registered", () => {
  assert.throws(() => registerResourceAdmissionConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerResourceAdmissionConformanceTests({}), /evaluateAdmission/u);
  assert.throws(
    () => registerResourceAdmissionConformanceTests({
      evaluateAdmission() {},
      createHistoryStore() {},
      fixturePrefix: "resource-test-",
      schemas: {},
    }),
    /schemas\.capture/u,
  );
});

test("invalid public-tunnel adapters fail before any conformance tests are registered", () => {
  assert.throws(() => registerPublicTunnelConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerPublicTunnelConformanceTests({}), /extractPublicTunnelUrl/u);
  assert.throws(
    () => registerPublicTunnelConformanceTests({
      extractPublicTunnelUrl() {},
      inspectPublicTunnelReadiness() {},
      inspectExternalReadiness() {},
      productName: "Product",
      productId: "product",
      schemas: {},
    }),
    /schemas\.health/u,
  );
});

test("invalid audit-classification adapters fail before test registration", () => {
  assert.throws(() => registerAuditClassificationConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerAuditClassificationConformanceTests({}), /classify/u);
  assert.throws(
    () => registerAuditClassificationConformanceTests({ classify() {}, errorPrefix: "unsafe-prefix" }),
    /errorPrefix/u,
  );
});

test("invalid native-patch-parent adapters fail before test registration", () => {
  assert.throws(() => registerNativePatchParentConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerNativePatchParentConformanceTests({}), /applyTransaction/u);
  assert.throws(
    () => registerNativePatchParentConformanceTests({
      applyTransaction() {},
      isErrorCode() {},
      fixturePrefix: "patch-test-",
      codes: {},
    }),
    /codes\.duplicate/u,
  );
});

test("invalid oauth-provider adapters fail before test registration", () => {
  assert.throws(() => registerOAuthProviderConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerOAuthProviderConformanceTests({}), /createProvider/u);
  assert.throws(
    () => registerOAuthProviderConformanceTests({
      createProvider() {},
      isErrorCode() {},
      fixturePrefix: "oauth-test-",
      codes: {},
    }),
    /codes\.stateMismatch/u,
  );
});

test("invalid workspace-recovery adapters fail before test registration", () => {
  assert.throws(() => registerWorkspaceRecoveryConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerWorkspaceRecoveryConformanceTests({}), /createProvider/u);
  assert.throws(
    () => registerWorkspaceRecoveryConformanceTests({
      createProvider() {},
      buildLoadedPolicy() {},
      createPolicyEngine() {},
      createReceiptStore() {},
      isError() {},
      fixtureParent: "../unsafe",
      fixturePrefix: "recovery-test-",
      toolResultSchema: "product.tool_result.v1",
    }),
    /fixtureParent/u,
  );
});

test("invalid release-contract adapters fail before test registration", () => {
  assert.throws(() => registerReleaseContractConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerReleaseContractConformanceTests({}), /productName/u);
  assert.throws(
    () => registerReleaseContractConformanceTests({
      productName: "Product",
      releaseSchema: "product.gateway_release.v1",
      releaseManifestFile: "unsafe.json",
      activationScript: "scripts/activate.ps1",
      launcherScript: "scripts/start.ps1",
      temporaryPrefix: "product-release-",
    }),
    /releaseManifestFile/u,
  );
});

test("invalid cli-worktree-lifecycle adapters fail before test registration", () => {
  assert.throws(() => registerCliWorktreeLifecycleConformanceTests(undefined), /adapter object/u);
  assert.throws(() => registerCliWorktreeLifecycleConformanceTests({}), /createDefaultConfig/u);
  assert.throws(
    () => registerCliWorktreeLifecycleConformanceTests({
      createDefaultConfig() {},
      saveConfig() {},
      productName: "Product",
      productId: "product",
      fixturePrefix: "product-cli-",
      cliPath: "src/cli.ts",
      configEnv: "unsafe-env",
      stateEnv: "PRODUCT_STATE_DIR",
      ledgerEnv: "PRODUCT_LEDGER_PATH",
      errorCode: "PRODUCT_CLI_PERSISTENT_RUNTIME_REQUIRED",
    }),
    /configEnv/u,
  );
});
