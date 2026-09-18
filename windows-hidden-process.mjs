import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

export const windowsHiddenProcessConformanceTestCount = 1;

export function registerWindowsHiddenProcessConformanceTests() {
  test("Windows background process launch paths remain explicitly hidden", async () => {
    const [
      cli,
      capsules,
      provider,
      telemetry,
      daemon,
      tunnel,
      packageVerify,
      packageContents,
      gatewayInstall,
      hiddenLauncher,
    ] = await Promise.all([
      readFile("src/cli.ts", "utf8"),
      readFile("src/providers/native-process-capsules.ts", "utf8"),
      readFile("src/providers/native-provider.ts", "utf8"),
      readFile("src/providers/native-resource-telemetry.ts", "utf8"),
      readFile("src/runtime/daemon-manager.ts", "utf8"),
      readFile("src/runtime/public-tunnel.ts", "utf8"),
      readFile("scripts/verify-package.mjs", "utf8"),
      readFile("scripts/verify-package-contents.mjs", "utf8"),
      readFile("scripts/install-windows-gateway.ps1", "utf8"),
      readFile("scripts/start-windows-gateway-hidden.vbs", "utf8"),
    ]);

    assert.match(cli, /spawn\(command\.file, command\.args, \{[\s\S]*?windowsHide: true,/);
    assert.match(provider, /execFile\([\s\S]*?windowsHide: true,/);
    assert.match(provider, /spawn\("taskkill\.exe"[\s\S]*?windowsHide: true,/);
    assert.match(provider, /spawn\(executionLaunch\.file, executionLaunch\.args, \{[\s\S]*?windowsHide: true,/);
    assert.match(telemetry, /execFile\([\s\S]*?windowsHide: true,/);
    assert.match(daemon, /spawn\(process\.execPath[\s\S]*?windowsHide: true,/);
    assert.match(tunnel, /spawn\(executable, args, \{[\s\S]*?windowsHide: true,/);
    assert.match(packageVerify, /spawnSync\(process\.execPath[\s\S]*?windowsHide: true,/);
    assert.match(packageContents, /spawnSync\(packCommand[\s\S]*?windowsHide: true,/);

    assert.match(capsules, /CreateFlags = \[uint32\]8; ShowWindow = \[uint16\]0/);
    assert.match(capsules, /execFile\(file, args, \{ windowsHide: true,/);
    assert.match(capsules, /spawn\("taskkill\.exe"[\s\S]*?windowsHide: true,/);
    assert.match(capsules, /spawn\(snapshot\.cleanupFile![\s\S]*?windowsHide: true,/);

    assert.match(gatewayInstall, /\/\/B \/\/NoLogo/);
    assert.match(gatewayInstall, /New-ScheduledTaskSettingsSet[\s\S]*?-Hidden/);
    assert.match(hiddenLauncher, /-WindowStyle Hidden/);
    assert.match(hiddenLauncher, /shell\.Run\(command, 0, True\)/);
  });
}
