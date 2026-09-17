import assert from "node:assert/strict";
import test from "node:test";

export const errorContractConformanceTestCount = 6;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Error-contract conformance requires an adapter object.");
  }
  for (const name of ["normalize", "createError"]) {
    if (typeof adapter[name] !== "function") {
      throw new TypeError(`Error-contract conformance adapter requires ${name}().`);
    }
  }
}

export function registerErrorContractConformanceTests(adapter) {
  validateAdapter(adapter);
  const { normalize, createError } = adapter;

  test("normalization preserves an existing runtime error and its cause", () => {
    const cause = new Error("original");
    const original = createError("OWN_ERROR", "owned", {
      operationApplied: "yes",
      retryable: true,
      cause,
    });
    assert.equal(normalize(original), original);
    assert.equal(normalize(original).cause, cause);
  });

  test("foreign error preserves every outcome and retryability combination", () => {
    for (const applied of ["yes", "no", "unknown"]) {
      for (const retryable of [true, false]) {
        const details = { stage: "provider-response", receiptId: "fixture-receipt" };
        const original = Object.assign(new Error("response lost"), {
          code: "PROVIDER_TIMEOUT",
          operationApplied: applied,
          retryable,
          details,
        });
        const actual = normalize(original);
        const label = `applied=${applied}, retryable=${retryable}`;
        assert.equal(actual.code, "PROVIDER_TIMEOUT", label);
        assert.equal(actual.operationApplied, applied, label);
        assert.equal(actual.retryable, retryable, label);
        assert.deepEqual(actual.details, details, label);
        assert.equal(actual.cause, original, label);
        assert.equal(actual.toJSON().operationApplied, applied, label);
      }
    }
  });

  test("malformed foreign metadata stays unknown and requires explicit typed values", () => {
    for (const applied of [undefined, null, "maybe", true, 0]) {
      const original = Object.assign(new Error("I/O failure"), {
        code: "EIO",
        operationApplied: applied,
      });
      assert.equal(normalize(original).operationApplied, "unknown", `outcome=${String(applied)}`);
      assert.equal(normalize(original).code, "EIO", `outcome=${String(applied)}`);
    }
    for (const retryable of [undefined, "true", 1]) {
      const original = Object.assign(new Error("failure"), {
        code: "PROVIDER_FAILURE",
        retryable,
      });
      assert.equal(normalize(original).retryable, false, `retryable=${String(retryable)}`);
    }
    for (const details of [null, ["not-a-record"], "not-a-record"]) {
      const original = Object.assign(new Error("failure"), {
        code: "PROVIDER_FAILURE",
        details,
      });
      assert.deepEqual(normalize(original).details, {}, `details=${JSON.stringify(details)}`);
    }
  });

  test("foreign metadata survives even when the error code is absent", () => {
    const original = Object.assign(new Error("foreign"), {
      operationApplied: "yes",
      retryable: true,
      details: { stage: "after-write" },
    });
    const actual = normalize(original);
    assert.match(actual.code, /_UNEXPECTED_ERROR$/u);
    assert.equal(actual.operationApplied, "yes");
    assert.equal(actual.retryable, true);
    assert.deepEqual(actual.details, original.details);
  });

  test("blank error codes use the runtime fallback", () => {
    const actual = normalize(Object.assign(new Error("blank"), { code: " " }));
    assert.match(actual.code, /_UNEXPECTED_ERROR$/u);
  });

  test("non-Error throws remain ambiguous and are not declared unapplied", () => {
    const actual = normalize("disconnected");
    assert.equal(actual.operationApplied, "unknown");
    assert.equal(actual.retryable, false);
  });
}
