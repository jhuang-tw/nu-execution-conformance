export interface NativeExitCodeConformanceProvider {
  call(tool: string, input: Record<string, unknown>): Promise<any>;
  close(): Promise<void>;
}

export interface NativeExitCodeConformanceAdapter {
  fixturePrefix: string;
  windowsFixtureBase?: string;
  createProvider(options: {
    roots: string[];
    commandTimeoutMs: number;
  }): NativeExitCodeConformanceProvider;
}

export declare const nativeExitCodeConformanceTestCount: 4;
export declare function registerNativeExitCodeConformanceTests(
  adapter: NativeExitCodeConformanceAdapter,
): void;
