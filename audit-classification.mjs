import assert from "node:assert/strict";
import test from "node:test";

export const auditClassificationConformanceTestCount = 1;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Audit-classification conformance requires an adapter object.");
  }
  if (typeof adapter.classify !== "function") {
    throw new TypeError("Audit-classification conformance adapter requires classify().");
  }
  if (typeof adapter.errorPrefix !== "string" || !/^[A-Z][A-Z0-9_]*$/u.test(adapter.errorPrefix)) {
    throw new TypeError("Audit-classification conformance adapter requires errorPrefix.");
  }
}

export function registerAuditClassificationConformanceTests(adapter) {
  validateAdapter(adapter);
  const { classify, errorPrefix } = adapter;
  const code = (suffix) => `${errorPrefix}_${suffix}`;

  test("gateway audit distinguishes policy denials from ordinary execution errors", () => {
    assert.equal(classify(code("POLICY_DENIED")), "deny");
    assert.equal(classify(code("ARGUMENT_POLICY_DENIED")), "deny");
    assert.equal(classify(code("WORKSPACE_SCOPE_DENIED")), "deny");
    assert.equal(classify(code("TOOL_QUARANTINED")), "quarantine");
    assert.equal(classify(code("TOOL_SCHEMA_MISMATCH")), "quarantine");

    assert.equal(classify(code("NATIVE_PATCH_PARENT_MISSING")), "error");
    assert.equal(classify(code("NATIVE_EDIT_TEXT_NOT_FOUND")), "error");
    assert.equal(classify(code("REQUEST_KEY_CONFLICT")), "error");
    assert.equal(classify(code("WORKSPACE_STALE")), "error");
  });
}
