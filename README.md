# Nu Execution Conformance

`nu-execution-conformance` contains reusable, runtime-free test definitions for execution contracts shared by the Nu family.

The package does **not** contain a broker implementation, provider transport, process launcher, policy engine, product identity, activation code, or mutable runtime state. Products remain independently buildable and runnable. They inject their own implementation into a structural test adapter.

## Broker baseline

The first contract contains the fourteen broker behaviors that were previously copied across Ternu, Vyrnu, Zenu, and Aernu:

- required versus optional provider startup;
- inventory invalidation;
- read singleflight and owner/session isolation;
- request-key requirements, replay, conflict, and ambiguous outcomes;
- explicit provider selection for duplicate tool names;
- complete provider teardown after one close failure.

Product-specific tests stay in the product repository. Evidence-window tests, Aernu operation-evidence tests, gateway behavior, and implementation details are intentionally not part of this baseline.

## Redaction baseline

The redaction contract contains the two policy-boundary behaviors that were previously copied across Ternu, Vyrnu, and Zenu:

- structured secret and runtime-field redaction without corrupting ordinary source code;
- audit sinks retaining only bounded identifiers, decisions, and hashes.

Consumers inject their own redaction functions and in-memory audit sink. The package never reads credentials, process state, files, or product policy.

## Error normalization baseline

The error-contract module contains six normalization behaviors shared by the deterministic Nu runtimes:

- existing runtime errors and causes remain intact;
- explicit applied outcomes, retryability, details, and codes survive normalization;
- malformed foreign metadata fails closed to an unknown outcome and non-retryable state;
- missing and blank codes use the product's own unexpected-error fallback;
- foreign metadata survives when a code is absent;
- non-Error throws remain ambiguous rather than being declared unapplied.

Mutation replay and proven-unapplied retry behavior stay in the broker conformance contract. They are not duplicated in this module. Consumers inject only their own error constructor and normalizer.

## Native exit-code baseline

The native exit-code module contains four transport behaviors shared by Ternu, Vyrnu, and Zenu:

- PowerShell preserves native `0`, `1`, and `7` exits and reports thrown, missing, and terminating commands as failures;
- Bash preserves native exits and missing-command failure;
- CMD preserves native exits and quoted inline Node programs;
- `run_checks` preserves quoted CMD inline-code arguments.

Consumers inject their own first-party native provider. The shared contract creates only a bounded disposable workspace beneath the consumer-selected test root, executes through that injected provider, and removes the fixture afterward. It does not launch a sibling Nu runtime, open a network listener, or choose product policy.

## Durable mutation-ledger baseline

The mutation-ledger module contains seven SQLite-backed durability behaviors shared by Ternu, Vyrnu, and Zenu:

- successful mutations replay after broker and database reopen without a second provider call;
- conflicting request keys and abandoned inflight claims fail before provider launch;
- independent SQLite connections admit only one execution claim;
- retries are allowed only after a provider-confirmed not-applied result;
- manual applied and not-applied reconciliation controls replay authority;
- reconciliation evidence is compare-and-swap bound to the exact mutation attempt.

Consumers inject their own broker, SQLite ledger, canonical signature function, runtime error constructor, and product error codes. The package creates only a bounded temporary database and never owns a runtime implementation, product namespace, or reconciliation policy.

## Operation-stage telemetry baseline

The operation-stage module contains eight telemetry behaviors shared by Ternu, Vyrnu, and Zenu:

- active process liveness and caller attribution survive durable store restart without heartbeat spam;
- failed-operation normalization preserves the applied outcome and a stable product error code;
- abandoned active operations terminalize exactly once after runtime replacement;
- explicit waiting evidence remains durable without inventing success or failure;
- bounded in-memory event retention preserves monotonic sequence numbers;
- provider failures keep their original error while recording one terminal stage;
- telemetry reader tools do not recursively instrument themselves;
- public runtime summaries retain only the bounded operation evidence fields.

Consumers inject their broker, memory and SQLite stage stores, memory mutation ledger, error constructor, summary projector, schema identity, and product error codes. The shared package owns no telemetry database, runtime process, or product policy.

## Process-session baseline

The process-session module contains five in-memory lifecycle behaviors shared by Ternu, Vyrnu, and Zenu:

- material progress advances only on spawn, output, and terminal evidence;
- stdout and stderr preserve independent UTF-8 decoder state across paged reads;
- retained-output boundaries do not corrupt split UTF-8 code points;
- workspace stop fails closed when termination cannot be confirmed;
- a close-observed process cannot be re-targeted by a same-turn PID stop.

Consumers inject only their native process-session store and product error-code matcher. Retained-capsule recovery remains product-local because Ternu and the richer runtimes intentionally differ in how a missing capsule root is terminalized.

## Resource-admission baseline

The resource-admission module contains three deterministic resource-safety behaviors shared by Ternu, Vyrnu, and Zenu:

- observed and historical working-set demand must preserve the physical-headroom admission boundary;
- hashed workload history persists only conservative non-decreasing peaks;
- commit pressure remains advisory while degraded telemetry never bypasses a provable physical denial.

Consumers inject their existing admission evaluator, resource-history store, schema identities, and fixture prefix. Windows sampling, process-tree collection, product release state, and public runtime projection remain product-local.

## Public-tunnel baseline

The public-tunnel module contains four readiness behaviors shared by Ternu, Vyrnu, and Zenu:

- Cloudflare quick-tunnel output yields the bounded public URL;
- ngrok free and development domains are accepted without broad URL matching;
- readiness distinguishes installation, configuration, authentication, passive observation, and connectivity without mutating tunnel state;
- an existing public URL must expose the exact product health and readiness schemas.

Consumers inject their existing URL extractor and readiness inspectors plus product-owned schema identities. The shared package does not launch tunnel processes, read host configuration, perform network access, or own product health policy.

## Integration

Pin an exact repository revision as a development dependency, then register the contract from the product's broker test file:

```ts
import {
  registerBrokerConformanceTests,
  type ConformanceToolProvider,
} from "nu-execution-conformance/broker";

registerBrokerConformanceTests({
  createBroker: (providers) => new ToolBroker(providers as ToolProvider[]),
  createError: (code, message, options) => new ProductError(code, message, options),
  isErrorCode: (error, code) => error instanceof ProductError && error.code === code,
  codes: {
    requestKeyRequired: "PRODUCT_REQUEST_KEY_REQUIRED",
    requestKeyConflict: "PRODUCT_REQUEST_KEY_CONFLICT",
    ambiguousTool: "PRODUCT_AMBIGUOUS_TOOL",
    stopUnconfirmed: "PRODUCT_NATIVE_PROCESS_STOP_UNCONFIRMED",
  },
});
```

Redaction consumers register their implementation separately:

```ts
import { registerRedactionConformanceTests } from "nu-execution-conformance/redaction";

registerRedactionConformanceTests({
  redactString,
  redactValue,
  createAuditSink: () => new MemoryAuditSink(),
});
```

Error-normalization consumers use a two-function adapter:

```ts
import { registerErrorContractConformanceTests } from "nu-execution-conformance/error-contract";

registerErrorContractConformanceTests({
  normalize: asProductError,
  createError: (code, message, options) => new ProductError(code, message, options),
});
```

Native execution consumers register a provider factory and product-owned fixture root:

```ts
import { join } from "node:path";
import { registerNativeExitCodeConformanceTests } from "nu-execution-conformance/native-exit-code";

registerNativeExitCodeConformanceTests({
  fixturePrefix: "product-exit-code-",
  windowsFixtureBase: join(process.env.PUBLIC ?? "C:\\Users\\Public", "ProductTests"),
  createProvider: (options) => new NativeProvider(options),
});
```

Durable mutation consumers register their existing broker and ledger through a structural adapter:

```ts
import { registerMutationLedgerConformanceTests } from "nu-execution-conformance/mutation-ledger";

registerMutationLedgerConformanceTests({
  fixturePrefix: "product-ledger-test-",
  createBroker: (providers, ledger) => new ToolBroker(providers, { mutationLedger: ledger }),
  createLedger: (path) => new SqliteMutationLedger(path),
  canonicalCallSignature,
  createError: (code, message, options) => new ProductError(code, message, options),
  isErrorCode: (error, code) => error instanceof ProductError && error.code === code,
  codes: {
    requestKeyConflict: "PRODUCT_REQUEST_KEY_CONFLICT",
    mutationInflightOrAmbiguous: "PRODUCT_MUTATION_INFLIGHT_OR_AMBIGUOUS",
    mutationResolvedApplied: "PRODUCT_MUTATION_RESOLVED_APPLIED",
    resolutionClaimChanged: "PRODUCT_RESOLUTION_CLAIM_CHANGED",
  },
});
```

Operation-stage consumers register the existing telemetry implementation through one structural adapter:

```ts
import { registerOperationStageConformanceTests } from "nu-execution-conformance/operation-stage";

registerOperationStageConformanceTests({
  createBroker: (providers, options) => new ToolBroker(providers, options),
  createMemoryMutationLedger: () => new MemoryMutationLedger(),
  createMemoryStore: (runtimeId) => new MemoryOperationStageStore(runtimeId),
  createSqliteStore: (path, runtimeId) => new SqliteOperationStageStore(path, runtimeId),
  createError: (code, message, options) => new ProductError(code, message, options),
  isErrorCode: (error, code) => error instanceof ProductError && error.code === code,
  projectRuntimeSummary,
  operationStageSchema: "product.operation_stage_snapshot.v1",
  codes: {
    stageTestFailure: "PRODUCT_STAGE_TEST_FAILURE",
    providerFailure: "PRODUCT_PROVIDER_FAILURE",
    operationFailed: "PRODUCT_OPERATION_FAILED",
    operationRuntimeLost: "PRODUCT_OPERATION_RUNTIME_LOST",
  },
});
```

Process-session consumers keep product-specific retained-capsule behavior beside one shared lifecycle adapter:

```ts
import { registerProcessSessionConformanceTests } from "nu-execution-conformance/process-session";

registerProcessSessionConformanceTests({
  createStore: () => new NativeProcessSessionStore(),
  isErrorCode: (error, code) => error instanceof ProductError && error.code === code,
  codes: {
    stopUnconfirmed: "PRODUCT_NATIVE_PROCESS_STOP_UNCONFIRMED",
  },
});
```

Resource-admission consumers inject the existing deterministic implementation:

```ts
import { registerResourceAdmissionConformanceTests } from "nu-execution-conformance/resource-admission";

registerResourceAdmissionConformanceTests({
  fixturePrefix: "product-resource-history-",
  evaluateAdmission: evaluateNativeResourceAdmission,
  createHistoryStore: (options) => new NativeResourceHistoryStore(options),
  schemas: {
    capture: "product.native_resource_telemetry_capture.v1",
    processTree: "product.native_process_tree_resource_telemetry.v1",
    host: "product.native_host_resource_telemetry.v1",
    admission: "product.native_resource_admission.v1",
    history: "product.native_resource_history.v1",
  },
});
```

Public-tunnel consumers inject only the existing pure contract surface:

```ts
import { registerPublicTunnelConformanceTests } from "nu-execution-conformance/public-tunnel";

registerPublicTunnelConformanceTests({
  productName: "Product",
  productId: "product",
  extractPublicTunnelUrl,
  inspectPublicTunnelReadiness,
  inspectExternalReadiness,
  schemas: {
    health: "product.gateway_health.v1",
    ready: "product.gateway_ready.v1",
  },
});
```

The package registers tests with Node's built-in test runner. It performs no network access or product activation. File-system activity is limited to bounded disposable fixtures, and process execution occurs only through the implementation injected by the consumer.

## Validation

```powershell
npm test
npm run verify
```

`npm run verify` checks syntax, package self-tests, and the exact publishable file set.
