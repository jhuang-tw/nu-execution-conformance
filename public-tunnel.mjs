import assert from "node:assert/strict";
import test from "node:test";

export const publicTunnelConformanceTestCount = 4;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Public-tunnel conformance requires an adapter object.");
  }
  for (const name of [
    "extractPublicTunnelUrl",
    "inspectPublicTunnelReadiness",
    "inspectExternalReadiness",
  ]) {
    if (typeof adapter[name] !== "function") {
      throw new TypeError(`Public-tunnel conformance adapter requires ${name}().`);
    }
  }
  for (const name of ["productName", "productId"]) {
    if (typeof adapter[name] !== "string" || adapter[name].length === 0) {
      throw new TypeError(`Public-tunnel conformance adapter requires ${name}.`);
    }
  }
  for (const name of ["health", "ready"]) {
    if (typeof adapter.schemas?.[name] !== "string" || adapter.schemas[name].length === 0) {
      throw new TypeError(`Public-tunnel conformance adapter requires schemas.${name}.`);
    }
  }
}

export function registerPublicTunnelConformanceTests(adapter) {
  validateAdapter(adapter);
  const {
    extractPublicTunnelUrl,
    inspectPublicTunnelReadiness,
    inspectExternalReadiness,
    productName,
    productId,
    schemas,
  } = adapter;

  test("public tunnel URL extraction accepts Cloudflare quick tunnel output", () => {
    assert.equal(
      extractPublicTunnelUrl(
        "cloudflare",
        "INF Your quick Tunnel has been created! Visit it at https://small-river-42.trycloudflare.com",
      ),
      "https://small-river-42.trycloudflare.com",
    );
  });

  test("public tunnel URL extraction accepts ngrok free and development domains", () => {
    assert.equal(
      extractPublicTunnelUrl("ngrok", '{"url":"https://sample-name.ngrok-free.app"}'),
      "https://sample-name.ngrok-free.app",
    );
    assert.equal(
      extractPublicTunnelUrl("ngrok", "started endpoint https://sample-name.ngrok.app"),
      "https://sample-name.ngrok.app",
    );
  });

  test("public tunnel readiness is side-effect-free and distinguishes install/config/connectivity boundaries", async () => {
    const calls = [];
    const probe = async (_executable, args) => {
      calls.push(args.join(" "));
      return { available: true, exitCode: 0, timedOut: false, output: "ok" };
    };
    const ngrok = await inspectPublicTunnelReadiness({
      provider: "ngrok",
      probe,
      environment: { NGROK_AUTHTOKEN: "test-token" },
      authProbe: async () => ({ available: true, authenticated: true, timedOut: false }),
    });
    assert.deepEqual(ngrok, {
      provider: "ngrok",
      status: "ready",
      executableAvailable: true,
      configValid: true,
      authConfigured: true,
      authVerified: true,
      connectivity: true,
    });
    assert.deepEqual(calls, ["version", "config check"]);

    const missing = await inspectPublicTunnelReadiness({
      provider: "cloudflare",
      probe: async () => ({ available: false, exitCode: null, timedOut: false, output: "" }),
    });
    assert.equal(missing.status, "not-installed");
    assert.equal(missing.executableAvailable, false);

    const cloudflareAvailable = await inspectPublicTunnelReadiness({
      provider: "cloudflare",
      probe: async () => ({ available: true, exitCode: 0, timedOut: false, output: "cloudflared version" }),
    });
    assert.deepEqual(cloudflareAvailable, {
      provider: "cloudflare",
      status: "available",
      executableAvailable: true,
    });

    let step = 0;
    const notConfigured = await inspectPublicTunnelReadiness({
      provider: "ngrok",
      environment: { NGROK_AUTHTOKEN: "test-token" },
      authProbe: async () => ({ available: true, authenticated: true, timedOut: false }),
      probe: async () => {
        step += 1;
        return step === 1
          ? { available: true, exitCode: 0, timedOut: false, output: "version" }
          : { available: true, exitCode: 1, timedOut: false, output: "invalid config" };
      },
    });
    assert.equal(notConfigured.status, "not-configured");

    const missingAuth = await inspectPublicTunnelReadiness({
      provider: "ngrok",
      environment: {},
      probe: async (_executable, args) => ({
        available: true,
        exitCode: 0,
        timedOut: false,
        output: args.join(" "),
      }),
      readTextFile: async () => "version: 3\nagent:\n  authtoken: ''\n",
    });
    assert.equal(missingAuth.status, "not-configured");
    assert.equal(missingAuth.configValid, true);
    assert.equal(missingAuth.authConfigured, false);
    assert.equal(missingAuth.authVerified, false);

    const configAuth = await inspectPublicTunnelReadiness({
      provider: "ngrok",
      environment: {},
      probe: async () => ({ available: true, exitCode: 0, timedOut: false, output: "ok" }),
      readTextFile: async () => "version: 3\nagent:\n  authtoken: 2abc_test_secret\n",
      authProbe: async () => ({ available: true, authenticated: true, timedOut: false }),
    });
    assert.equal(configAuth.status, "ready");
    assert.equal(configAuth.authConfigured, true);
    assert.equal(configAuth.authVerified, true);

    const rejectedAuth = await inspectPublicTunnelReadiness({
      provider: "ngrok",
      environment: { NGROK_AUTHTOKEN: "configured-but-invalid" },
      probe: async () => ({ available: true, exitCode: 0, timedOut: false, output: "ok" }),
      authProbe: async () => ({ available: true, authenticated: false, timedOut: false }),
    });
    assert.equal(rejectedAuth.status, "authentication-failed");
    assert.equal(rejectedAuth.authConfigured, true);
    assert.equal(rejectedAuth.authVerified, false);

    let passiveAuthProbeCalled = false;
    const passive = await inspectPublicTunnelReadiness({
      provider: "ngrok",
      environment: { NGROK_AUTHTOKEN: "configured-token" },
      probe: async () => ({ available: true, exitCode: 0, timedOut: false, output: "ok" }),
      authProbe: async () => {
        passiveAuthProbeCalled = true;
        return { available: true, authenticated: true, timedOut: false };
      },
      verifyAuthentication: false,
    });
    assert.equal(passive.status, "configured");
    assert.equal(passive.authConfigured, true);
    assert.equal(passive.authVerified, false);
    assert.equal(passiveAuthProbeCalled, false, "passive existing-status checks must not start an ngrok agent session");
  });

  test(`existing public URL verification requires ${productName} health and ready contracts`, async () => {
    const ready = await inspectExternalReadiness({
      publicBaseUrl: `https://${productId}.example.test`,
      fetchFn: async (input) => {
        const url = String(input);
        return new Response(JSON.stringify(url.endsWith("/healthz")
          ? { schema: schemas.health, ok: true }
          : { schema: schemas.ready, ready: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    assert.equal(ready.status, "ready");
    assert.equal(ready.healthOk, true);
    assert.equal(ready.ready, true);

    const wrongProduct = await inspectExternalReadiness({
      publicBaseUrl: "https://wrong.example.test",
      fetchFn: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    });
    assert.equal(wrongProduct.status, `not-${productId}`);
  });
}
