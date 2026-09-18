import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

export const oauthProviderConformanceTestCount = 3;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("OAuth-provider conformance requires an adapter object.");
  }
  if (typeof adapter.createProvider !== "function") {
    throw new TypeError("OAuth-provider conformance adapter requires createProvider().");
  }
  if (typeof adapter.isErrorCode !== "function") {
    throw new TypeError("OAuth-provider conformance adapter requires isErrorCode().");
  }
  if (typeof adapter.fixturePrefix !== "string" || !/^[a-z0-9][a-z0-9-]*-$/u.test(adapter.fixturePrefix)) {
    throw new TypeError("OAuth-provider conformance adapter requires fixturePrefix.");
  }
  for (const name of ["stateMismatch", "resourceMismatch"]) {
    if (typeof adapter.codes?.[name] !== "string" || adapter.codes[name].length === 0) {
      throw new TypeError(`OAuth-provider conformance adapter requires codes.${name}.`);
    }
  }
}

export function registerOAuthProviderConformanceTests(adapter) {
  validateAdapter(adapter);
  const { createProvider, isErrorCode, fixturePrefix, codes } = adapter;
  const redirectUrl = "http://127.0.0.1:43177/callback";

  test("persists OAuth client information and refresh tokens", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), `${fixturePrefix}persist-`));
    t.after(async () => rm(directory, { recursive: true, force: true }));
    const statePath = join(directory, "provider.json");
    const first = createProvider({ providerId: "synthetic", redirectUrl, statePath });
    await first.saveClientInformation({ client_id: "client-1" });
    await first.saveTokens({
      access_token: "access",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "refresh",
      scope: "synthetic.read",
    });

    const second = createProvider({ providerId: "synthetic", redirectUrl, statePath });
    assert.equal((await second.clientInformation())?.client_id, "client-1");
    assert.equal((await second.tokens())?.refresh_token, "refresh");
  });

  test("validates OAuth callback state exactly once", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), `${fixturePrefix}state-`));
    t.after(async () => rm(directory, { recursive: true, force: true }));
    const provider = createProvider({
      providerId: "synthetic",
      redirectUrl,
      statePath: join(directory, "provider.json"),
    });
    const state = provider.state();
    provider.consumeState(state);
    assert.throws(() => provider.consumeState(state), (error) => isErrorCode(error, codes.stateMismatch));
  });

  test("allows a configured OAuth resource to differ from the local transport and rejects drift", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), `${fixturePrefix}resource-`));
    t.after(async () => rm(directory, { recursive: true, force: true }));
    const provider = createProvider({
      providerId: "synthetic",
      redirectUrl,
      statePath: join(directory, "provider.json"),
      resourceUrl: "https://provider.example/mcp",
    });

    assert.equal(
      (await provider.validateResourceURL(
        "http://127.0.0.1:49001/mcp",
        "https://provider.example/mcp",
      ))?.toString(),
      "https://provider.example/mcp",
    );
    await assert.rejects(
      provider.validateResourceURL(
        "http://127.0.0.1:49001/mcp",
        "https://other.example/mcp",
      ),
      (error) => isErrorCode(error, codes.resourceMismatch),
    );
  });
}
