export interface WorkspaceRecoveryProvider {
  close(): Promise<void>;
  listTools(): Promise<any[]>;
  call(tool: string, input: Record<string, unknown>, context?: Record<string, unknown>): Promise<unknown>;
}

export interface WorkspaceRecoveryPolicyEngine {
  resolveForCall(descriptors: any[], tool: string, identity: any): any;
  authorizeCall(binding: any, request: any, identity: any): Promise<any>;
  observeResult(tool: string, input: Record<string, unknown>, identity: any, envelope: any): Promise<void>;
  rotatePublicWorkspaceToken(identity: any, input: Record<string, unknown>): void;
  projectPublicResult(identity: any, input: Record<string, unknown>, envelope: any, binding: any): any;
}

export interface WorkspaceRecoveryReceiptStore {
  reserve(input: any): { operationId: string | number };
  activate(operationId: string): void;
  inspect(input: any): { available: boolean; [key: string]: unknown };
}

export interface WorkspaceRecoveryConformanceAdapter {
  fixtureParent: string;
  fixturePrefix: string;
  toolResultSchema: string;
  createProvider(options: { roots: string[] }): WorkspaceRecoveryProvider;
  buildLoadedPolicy(input: any): any;
  createPolicyEngine(loadedPolicy: any, profile: string): Promise<WorkspaceRecoveryPolicyEngine>;
  createReceiptStore(options?: { ttlMs?: number }): WorkspaceRecoveryReceiptStore;
  isError(error: unknown, codeSuffix: string, operationApplied?: "yes" | "no" | "unknown"): boolean;
}

export declare const workspaceRecoveryConformanceTestCount: 6;
export declare function registerWorkspaceRecoveryConformanceTests(
  adapter: WorkspaceRecoveryConformanceAdapter,
): void;
