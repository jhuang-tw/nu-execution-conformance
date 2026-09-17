import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  brokerConformanceTestCount,
  registerBrokerConformanceTests,
} from "../broker.mjs";

test("broker conformance exports one bounded fourteen-test contract", async () => {
  assert.equal(brokerConformanceTestCount, 14);
  const source = await readFile(new URL("../broker.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/\btest\("/gu) ?? []).length, brokerConformanceTestCount);
});

test("broker conformance remains product-neutral and runtime-free", async () => {
  const source = await readFile(new URL("../broker.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:Ternu|Vyrnu|Zenu|Aernu)\b/u);
  assert.doesNotMatch(source, /(?:child_process|worker_threads|http:|https:|express|modelcontextprotocol)/u);
});

test("invalid adapters fail before any conformance tests are registered", () => {
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
