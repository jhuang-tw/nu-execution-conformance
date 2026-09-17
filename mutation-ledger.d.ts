export type ConformanceOperationApplied = "yes" | "no" | "unknown";

export interface MutationLedgerConformanceError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly operationApplied: ConformanceOperationApplied;
  readonly details: Record<string, unknown>;
  toJSON(): Record<string, unknown>;
}

export interface MutationLedgerConformanceProvider {
  readonly id: string;
  connect(): Promise<void>;
  close(): Promise<void>;
  listTools(): Promise<Array<Record<string, unknown>>>;
  call(tool: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface MutationLedgerConformanceReceipt {
  requestKey: string;
  signature: string;
  provider: string;
  tool: string;
  sideEffect: "write" | "unknown";
  state: "inflight" | "succeeded" | "failed";
  requestId: string;
  attempt: number;
  startedAt: string;
  completedAt?: string;
  operationApplied: ConformanceOperationApplied;
  resolutionReason?: string;
  resolvedAt?: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface MutationLedgerConformanceLedger {
  claim(input: {
    requestKey: string;
    signature: string;
    provider: string;
    tool: string;
    sideEffect: "write" | "unknown";
    requestId: string;
    startedAt: string;
  }): Promise<{
    action: "execute" | "replay" | "blocked" | "conflict";
    receipt: MutationLedgerConformanceReceipt;
    [key: string]: unknown;
  }>;
  fail(input: {
    requestKey: string;
    signature: string;
    requestId: string;
    error: MutationLedgerConformanceError;
    completedAt: string;
  }): Promise<void>;
  get(requestKey: string): Promise<MutationLedgerConformanceReceipt | undefined>;
  resolve(input: {
    requestKey: string;
    requestId: string;
    outcome: "applied" | "not-applied";
    reason: string;
  }): Promise<MutationLedgerConformanceReceipt>;
  close(): Promise<void>;
}

export interface MutationLedgerConformanceBroker {
  execute(request: {
    provider?: string;
    tool: string;
    input: Record<string, unknown>;
    requestKey?: string;
  }): Promise<{
    requestId: string;
    originRequestId?: string;
    replayed: boolean;
    [key: string]: unknown;
  }>;
  close(): Promise<void>;
}

export interface MutationLedgerConformanceCodes {
  requestKeyConflict: string;
  mutationInflightOrAmbiguous: string;
  mutationResolvedApplied: string;
  resolutionClaimChanged: string;
}

export interface MutationLedgerConformanceAdapter {
  fixturePrefix: string;
  createBroker(
    providers: MutationLedgerConformanceProvider[],
    ledger: MutationLedgerConformanceLedger,
  ): MutationLedgerConformanceBroker;
  createLedger(path: string): MutationLedgerConformanceLedger;
  canonicalCallSignature(
    provider: string,
    tool: string,
    input: Record<string, unknown>,
  ): string;
  createError(
    code: string,
    message: string,
    options?: {
      retryable?: boolean;
      operationApplied?: ConformanceOperationApplied;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ): MutationLedgerConformanceError;
  isErrorCode(error: unknown, code: string): boolean;
  codes: MutationLedgerConformanceCodes;
}

export declare const mutationLedgerConformanceTestCount: 7;
export declare function registerMutationLedgerConformanceTests(
  adapter: MutationLedgerConformanceAdapter,
): void;
