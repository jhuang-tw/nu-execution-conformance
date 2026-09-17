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

The package registers tests with Node's built-in test runner. It performs no network access or product activation. File-system activity is limited to bounded disposable fixtures, and process execution occurs only through the implementation injected by the consumer.

## Validation

```powershell
npm test
npm run verify
```

`npm run verify` checks syntax, package self-tests, and the exact publishable file set.
