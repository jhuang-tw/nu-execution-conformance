export type OperationStageConformanceSideEffect = "read" | "write" | "unknown";
export type OperationStageConformanceApplied = "no" | "yes" | "unknown";

export interface OperationStageConformanceDescriptor {
  provider: string;
  name: string;
  inputSchema: Record<string, unknown>;
  sideEffect: OperationStageConformanceSideEffect;
  destructive: boolean;
  idempotent: boolean;
  openWorld: boolean;
  [key: string]: unknown;
}

export interface OperationStageConformanceReporter {
  (update: Record<string, unknown>): void | Promise<void>;
}

export interface OperationStageConformanceProvider {
  readonly id: string;
  connect(): Promise<void>;
  close(): Promise<void>;
  listTools(): Promise<OperationStageConformanceDescriptor[]>;
  call(
    tool: string,
    input: Record<string, unknown>,
    options?: {
      timeoutMs?: number;
      requestKey?: string;
      ownerKey?: string;
      requestId?: string;
      reportStage?: OperationStageConformanceReporter;
    },
  ): Promise<unknown>;
}

export interface OperationStageConformanceStore {
  begin(input: Record<string, unknown>): unknown;
  transition(requestId: string, input: Record<string, unknown>): unknown;
  complete(requestId: string, completedAt: string): unknown;
  fail(requestId: string, completedAt: string, error: Record<string, unknown>): unknown;
  snapshot(limit?: number): {
    active: number;
    operations: Array<Record<string, any>>;
    events: Array<Record<string, any>>;
    [key: string]: any;
  };
  close(): void;
}

export interface OperationStageConformanceMutationLedger {
  close?(): void | Promise<void>;
  [key: string]: unknown;
}

export interface OperationStageConformanceBroker {
  execute(
    request: {
      provider?: string;
      tool: string;
      input: Record<string, unknown>;
      requestKey?: string;
    },
    signatureInput?: Record<string, unknown>,
    postExecutionValidator?: ((envelope: Record<string, any>) => Promise<void>),
    callContext?: { callerSessionId?: string; ownerKey?: string; providerSessionKey?: string },
  ): Promise<Record<string, any>>;
  close(): Promise<void>;
  operationEvidence(limit?: number): {
    active: number;
    operations: Array<Record<string, any>>;
    events: Array<Record<string, any>>;
    [key: string]: any;
  };
}

export interface OperationStageConformanceCodes {
  stageTestFailure: string;
  providerFailure: string;
  operationFailed: string;
  operationRuntimeLost: string;
}

export interface OperationStageConformanceAdapter {
  createBroker(
    providers: OperationStageConformanceProvider[],
    options?: {
      mutationLedger?: OperationStageConformanceMutationLedger;
      operationStageStore?: OperationStageConformanceStore;
    },
  ): OperationStageConformanceBroker;
  createMemoryMutationLedger(): OperationStageConformanceMutationLedger;
  createMemoryStore(runtimeId: string): OperationStageConformanceStore;
  createSqliteStore(path: string, runtimeId: string): OperationStageConformanceStore;
  createError(
    code: string,
    message: string,
    options: { operationApplied: OperationStageConformanceApplied },
  ): Error;
  isErrorCode(error: unknown, code: string): boolean;
  projectRuntimeSummary(input: Record<string, unknown>): Record<string, any>;
  codes: OperationStageConformanceCodes;
  operationStageSchema: string;
}

export declare const operationStageConformanceTestCount: 8;
export declare function registerOperationStageConformanceTests(adapter: OperationStageConformanceAdapter): void;
