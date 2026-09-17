# Engineering contract

This repository owns reusable test definitions only.

- Never add a runtime implementation, product service, provider transport, browser integration, process launcher, activation script, policy engine, credential, or mutable product state.
- Keep contracts product-neutral. Product names and product-specific tests belong in the consuming repository.
- A shared conformance test must exercise a genuinely shared public behavior in at least two current consumers.
- Prefer a small structural adapter over product-specific branches, path detection, code generation, or compatibility aliases.
- Do not weaken a test merely to make divergent implementations pass. Either fix the consumer or leave the behavior product-specific.
- Pin exact revisions in consumers. Do not depend on an unbounded branch or floating tag.
- Keep the package dependency-free unless a dependency is required by a shared observable contract and clearly reduces total complexity.
- Run `npm run verify` before publishing a revision.
