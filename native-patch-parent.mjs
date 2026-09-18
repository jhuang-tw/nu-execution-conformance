import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

export const nativePatchParentConformanceTestCount = 2;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Native-patch-parent conformance requires an adapter object.");
  }
  if (typeof adapter.applyTransaction !== "function") {
    throw new TypeError("Native-patch-parent conformance adapter requires applyTransaction().");
  }
  if (typeof adapter.isErrorCode !== "function") {
    throw new TypeError("Native-patch-parent conformance adapter requires isErrorCode().");
  }
  if (typeof adapter.fixturePrefix !== "string" || !/^[a-z0-9][a-z0-9-]*-$/u.test(adapter.fixturePrefix)) {
    throw new TypeError("Native-patch-parent conformance adapter requires fixturePrefix.");
  }
  if (typeof adapter.codes?.duplicate !== "string" || adapter.codes.duplicate.length === 0) {
    throw new TypeError("Native-patch-parent conformance adapter requires codes.duplicate.");
  }
}

export function registerNativePatchParentConformanceTests(adapter) {
  validateAdapter(adapter);
  const { applyTransaction, isErrorCode, fixturePrefix, codes } = adapter;

  test("transactional Add File creates missing in-workspace parent directories", async (t) => {
    const root = await mkdtemp(join(tmpdir(), `${fixturePrefix}parent-`));
    t.after(async () => rm(root, { recursive: true, force: true }));

    await applyTransaction(root, [
      {
        path: "frontend/package.json",
        before: null,
        after: { content: "{\"private\":true}\n", mode: 0o644 },
      },
    ]);

    assert.equal(await readFile(join(root, "frontend", "package.json"), "utf8"), "{\"private\":true}\n");
  });

  test("transaction prevalidation does not create parent directories when the patch is invalid", async (t) => {
    const root = await mkdtemp(join(tmpdir(), `${fixturePrefix}parent-invalid-`));
    t.after(async () => rm(root, { recursive: true, force: true }));

    await assert.rejects(
      applyTransaction(root, [
        {
          path: "frontend/package.json",
          before: null,
          after: { content: "{}\n", mode: 0o644 },
        },
        {
          path: "frontend/package.json",
          before: null,
          after: { content: "{\"duplicate\":true}\n", mode: 0o644 },
        },
      ]),
      (error) => isErrorCode(error, codes.duplicate),
    );

    await assert.rejects(stat(join(root, "frontend")));
  });
}
