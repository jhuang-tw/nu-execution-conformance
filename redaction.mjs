import assert from "node:assert/strict";
import test from "node:test";

export const redactionConformanceTestCount = 2;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Redaction conformance requires an adapter object.");
  }
  for (const name of ["redactString", "redactValue", "createAuditSink"]) {
    if (typeof adapter[name] !== "function") {
      throw new TypeError(`Redaction conformance adapter requires ${name}().`);
    }
  }
}

export function registerRedactionConformanceTests(adapter) {
  validateAdapter(adapter);
  const { redactString, redactValue, createAuditSink } = adapter;

  test("structured redaction removes synthetic secrets and sensitive runtime fields without damaging code", () => {
    const synthetic = "synthetic-secret-1234567890";
    const value = redactValue({
      access_token: synthetic,
      authorization: `Bearer ${synthetic}`,
      providerToken: synthetic,
      expectedWorkspaceToken: synthetic,
      currentWorkspaceToken: synthetic,
      apiToken: synthetic,
      authorizationCode: synthetic,
      oauthCode: synthetic,
      credentialsFile: "C:\\Users\\SyntheticUser\\secrets\\credentials.json",
      processEnv: { SYNTHETIC_SECRET: synthetic },
      cookies: [`session=${synthetic}`],
      workspaceToken: "public-workspace-token-remains-visible",
      nested: {
        url: `https://user:${synthetic}@example.test/repo.git`,
        ownerTokenPath: "C:\\Users\\SyntheticUser\\secrets\\owner-token",
        commandLine: "python secret.py",
        pidTree: [{ pid: 123 }],
        source: "const tokenCount = values.length;\nfunction normalCode() { return 42; }",
      },
    });
    const serialized = JSON.stringify(value);
    assert.doesNotMatch(serialized, new RegExp(synthetic));
    assert.doesNotMatch(serialized, /SyntheticUser/u);
    assert.match(serialized, /<redacted>/u);
    assert.match(serialized, /normalCode/u);
    assert.match(serialized, /public-workspace-token-remains-visible/u);
    assert.doesNotMatch(
      redactString(`https://example.test/callback?code=${synthetic}&state=ok&authorization_code=${synthetic}`),
      new RegExp(synthetic),
    );
    assert.doesNotMatch(redactString(`api_token=${synthetic}`), new RegExp(synthetic));
    assert.equal(
      redactString("const bearer = value; const apiKeyName = 'not-a-secret';"),
      "const bearer = value; const apiKeyName = 'not-a-secret';",
    );
  });

  test("audit records contain only identifiers and hashes", async () => {
    const audit = createAuditSink();
    await audit.append({
      timestamp: new Date().toISOString(),
      principalId: "hashed-principal",
      policyProfile: "public-workspace",
      policyHash: "a".repeat(64),
      provider: "synthetic",
      tool: "read",
      capability: "workspace.read",
      decision: "allow",
      normalizedInputHash: "b".repeat(64),
      outputHash: "c".repeat(64),
      durationMs: 1,
      operationApplied: "no",
      workspaceId: "ws-test",
    });
    assert.ok(Array.isArray(audit.records), "audit sink must expose bounded records for verification");
    const serialized = JSON.stringify(audit.records);
    assert.doesNotMatch(serialized, /access_token|refresh_token|Bearer|PRIVATE KEY/u);
    assert.equal(audit.records[0]?.decision, "allow");
  });
}
