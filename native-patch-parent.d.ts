export interface NativePatchFileState {
  content: string;
  mode: number;
}

export interface NativePatchTransactionFile {
  path: string;
  before: NativePatchFileState | null;
  after: NativePatchFileState | null;
}

export interface NativePatchParentConformanceAdapter {
  fixturePrefix: string;
  applyTransaction(root: string, files: NativePatchTransactionFile[]): Promise<unknown>;
  isErrorCode(error: unknown, code: string): boolean;
  codes: {
    duplicate: string;
  };
}

export declare const nativePatchParentConformanceTestCount: 2;
export declare function registerNativePatchParentConformanceTests(
  adapter: NativePatchParentConformanceAdapter,
): void;
