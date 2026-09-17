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

The package registers tests with Node's built-in test runner. It performs no I/O other than the behavior exercised through the injected broker.

## Validation

```powershell
npm test
npm run verify
```

`npm run verify` checks syntax, package self-tests, and the exact publishable file set.
