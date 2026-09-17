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

test("shared conformance remains product-neutral and runtime-free", async () => {
  const brokerSource = await readFile(new URL("../broker.mjs", import.meta.url), "utf8");
  const redactionSource = await readFile(new URL("../redaction.mjs", import.meta.url), "utf8");
  for (const source of [brokerSource, redactionSource]) {
    assert.doesNotMatch(source, /\b(?:Ternu|Vyrnu|Zenu|Aernu)\b/u);
    assert.doesNotMatch(source, /(?:child_process|worker_threads|express|modelcontextprotocol)/u);
  }
  assert.doesNotMatch(brokerSource, /(?:http:|https:)/u);
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
