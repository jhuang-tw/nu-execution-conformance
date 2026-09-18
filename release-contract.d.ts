export interface ReleaseContractConformanceAdapter {
  productName: string;
  releaseSchema: string;
  releaseManifestFile: string;
  activationScript: string;
  launcherScript: string;
  temporaryPrefix: string;
}

export declare const releaseContractConformanceTestCount: 1;
export declare function registerReleaseContractConformanceTests(
  adapter: ReleaseContractConformanceAdapter,
): void;
