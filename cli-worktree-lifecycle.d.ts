export interface CliWorktreeLifecycleConformanceAdapter {
  productName: string;
  productId: string;
  fixturePrefix: string;
  cliPath: string;
  configEnv: string;
  stateEnv: string;
  ledgerEnv: string;
  errorCode: string;
  createDefaultConfig(options: { roots: string[] }): unknown;
  saveConfig(path: string, config: unknown): Promise<void>;
}

export declare const cliWorktreeLifecycleConformanceTestCount: 1;
export declare function registerCliWorktreeLifecycleConformanceTests(
  adapter: CliWorktreeLifecycleConformanceAdapter,
): void;
