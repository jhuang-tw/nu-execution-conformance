import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

export const releaseContractConformanceTestCount = 1;

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Release-contract conformance requires an adapter object.");
  }
  for (const name of [
    "productName",
    "releaseSchema",
    "releaseManifestFile",
    "activationScript",
    "launcherScript",
    "temporaryPrefix",
  ]) {
    if (typeof adapter[name] !== "string" || adapter[name].length === 0) {
      throw new TypeError(`Release-contract conformance adapter requires ${name}.`);
    }
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(adapter.productName)) {
    throw new TypeError("Release-contract conformance adapter requires a safe productName.");
  }
  if (!/^\.[a-z0-9._-]+\.json$/u.test(adapter.releaseManifestFile)) {
    throw new TypeError("Release-contract conformance adapter requires a safe releaseManifestFile.");
  }
}

export function registerReleaseContractConformanceTests(adapter) {
  validateAdapter(adapter);

  test("managed release manifests version candidate, historical, and rollback verification", async () => {
    const activation = await readFile(adapter.activationScript, "utf8");
    const launcher = await readFile(adapter.launcherScript, "utf8");

    assert.match(activation, /manifestVersion = \$releaseManifestVersion/);
    assert.match(activation, /candidateVerifierVersion = \$candidateReleaseVerifierVersion/);
    assert.match(activation, /historicalVerifierVersion = 1/);
    assert.match(activation, /rollbackVerifierVersion = 1/);
    assert.match(activation, /requiredFiles = @\(/);
    assert.match(activation, /function Assert-ReleaseContract/);
    assert.match(activation, /if \(\$manifestVersion -eq 0\) \{/);
    assert.match(activation, /Assert-ReleaseContract \$releaseRoot \$manifest 'historical'/);
    assert.match(activation, /Assert-ReleaseContract \$rollbackReleaseRoot \$rollbackManifest 'rollback'/);
    assert.match(activation, /previous release content hash no longer verifies/);
    assert.match(activation, /previous release gateway hash no longer verifies/);
    assert.match(launcher, /function Assert-HistoricalReleaseContract/);
    assert.match(launcher, /Assert-HistoricalReleaseContract \$candidateRoot \$manifest/);

    const candidateVerify = activation.indexOf("[void](Assert-ReleaseContract $stageRoot $manifest 'candidate')");
    const manifestWrite = activation.indexOf(
      `Write-JsonAtomic (Join-Path $stageRoot '${adapter.releaseManifestFile}') $manifest`,
    );
    assert.ok(
      candidateVerify >= 0 && candidateVerify < manifestWrite,
      "Candidate contract must verify before the immutable manifest is committed.",
    );
    const rollbackVerify = activation.indexOf(
      "[void](Assert-ReleaseContract $rollbackReleaseRoot $rollbackManifest 'rollback')",
    );
    const rollbackPointerMove = activation.indexOf(
      "Move-Item -LiteralPath $temporaryPointer -Destination $pointerFile -Force",
    );
    assert.ok(
      rollbackVerify >= 0 && rollbackVerify < rollbackPointerMove,
      "Rollback release must verify before the previous pointer is restored.",
    );

    if (process.platform !== "win32") return;
    const scriptPath = resolve(process.cwd(), adapter.activationScript).replaceAll("'", "''");
    const scriptRoot = resolve(process.cwd(), "scripts").replaceAll("'", "''");
    const releaseSchema = adapter.releaseSchema.replaceAll("'", "''");
    const productName = adapter.productName.replaceAll("'", "''");
    const temporaryPrefix = adapter.temporaryPrefix.replaceAll("'", "''");
    const probe = String.raw`
$source = Get-Content -LiteralPath '${scriptPath}' -Raw
$marker = '$activationMutex = [Threading.Mutex]::new'
$prefix = $source.Substring(0, $source.IndexOf($marker))
$prefix = $prefix.Replace('$PSScriptRoot', '${scriptRoot}')
. ([scriptblock]::Create($prefix)) -PrepareOnly
$release = Join-Path ([IO.Path]::GetTempPath()) ('${temporaryPrefix}' + [Guid]::NewGuid().ToString('N'))
try {
  foreach ($relative in @('dist/cli.js', 'dist/runtime/mcp-gateway.js', 'public-workspace.policy.json', 'windows-executable-provenance.json')) {
    $path = Join-Path $release ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
    New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
    [IO.File]::WriteAllText($path, 'fixture')
  }
  $legacy = [pscustomobject]@{
    schema = '${releaseSchema}'
    verified = $true
    policySha256 = 'legacy-policy'
    runtimeProvenanceSha256 = 'legacy-provenance'
  }
  $legacyHistorical = Assert-ReleaseContract $release $legacy 'historical'
  $legacyRollback = Assert-ReleaseContract $release $legacy 'rollback'
  if ($legacyHistorical.manifestVersion -ne 0 -or $legacyHistorical.verifierVersion -ne 0 -or $legacyHistorical.requiredFiles.Count -ne 4) {
    throw 'legacy historical verifier contract failed'
  }
  if ($legacyRollback.manifestVersion -ne 0 -or $legacyRollback.verifierVersion -ne 0) {
    throw 'legacy rollback verifier contract failed'
  }

  $v1 = [ordered]@{
    schema = '${releaseSchema}'
    verified = $true
    manifestVersion = 1
    candidateVerifierVersion = 1
    historicalVerifierVersion = 1
    rollbackVerifierVersion = 1
    requiredFiles = @('dist/cli.js', 'dist/runtime/mcp-gateway.js', 'public-workspace.policy.json', 'windows-executable-provenance.json')
  }
  $candidate = Assert-ReleaseContract $release $v1 'candidate'
  $historical = Assert-ReleaseContract $release $v1 'historical'
  $rollback = Assert-ReleaseContract $release $v1 'rollback'
  if ($candidate.verifierVersion -ne 1 -or $historical.verifierVersion -ne 1 -or $rollback.verifierVersion -ne 1) {
    throw 'versioned verifier selection failed'
  }

  $unsupported = [pscustomobject]@{
    schema = '${releaseSchema}'
    verified = $true
    manifestVersion = 1
    candidateVerifierVersion = 1
    historicalVerifierVersion = 99
    rollbackVerifierVersion = 1
    requiredFiles = @('dist/cli.js')
  }
  $rejected = $false
  try { [void](Assert-ReleaseContract $release $unsupported 'historical') }
  catch { $rejected = $_.Exception.Message -match 'Unsupported ${productName} historical release verifier version' }
  if (-not $rejected) { throw 'unsupported historical verifier version was accepted' }
  Write-Output 'release contract matrix pass'
}
finally {
  Remove-Item -LiteralPath $release -Recurse -Force -ErrorAction SilentlyContinue
}
`;
    const result = spawnSync(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", probe],
      { cwd: process.cwd(), encoding: "utf8", windowsHide: true },
    );
    assert.equal(
      result.status,
      0,
      `Release contract matrix failed:\n${result.stdout}\n${result.stderr}`,
    );
    assert.match(result.stdout, /release contract matrix pass/);
  });
}
