export type ConformanceSideEffect = "read" | "write" | "unknown";
export type ConformanceOperationApplied = "no" | "yes" | "unknown";

export interface ConformanceToolDescriptor {
  provider: string;
  name: string;
  inputSchema: Record<string, unknown>;
  sideEffect: ConformanceSideEffect;
  destructive: boolean;
  idempotent: boolean;
  openWorld: boolean;
  [key: string]: unknown;
}

export interface ConformanceProviderCallOptions {
  timeoutMs?: number;
  requestKey?: string;
  ownerKey?: string;
  providerSessionKey?: string;
}

export interface ConformanceToolProvider {
  readonly id: string;
  startupMode?: "required" | "optional";
  connect(): Promise<void>;
  close(): Promise<void>;
  setToolsChangedHandler?(handler: (() => void) | undefined): void;
  listTools(): Promise<ConformanceToolDescriptor[]>;
  call(
    tool: string,
    input: Record<string, unknown>,
    options?: ConformanceProviderCallOptions,
  ): Promise<unknown>;
}

export interface ConformanceToolCallRequest {
  provider?: string;
  tool: string;
  input: Record<string, unknown>;
  requestKey?: string;
}

export interface ConformanceToolResultEnvelope {
  requestId: string;
  originRequestId?: string;
  provider: string;
  signature: string;
  replayed: boolean;
  [key: string]: unknown;
}

export interface ConformanceBrokerSnapshot {
  readSingleflightJoins: number;
  mutationReplays: number;
  requestKeyConflicts: number;
  [key: string]: unknown;
}

export interface ConformanceBroker {
  connect(): Promise<void>;
  close(): Promise<void>;
  listTools(): ConformanceToolDescriptor[];
  ensureFreshTools(): Promise<ConformanceToolDescriptor[]>;
  execute(
    request: ConformanceToolCallRequest,
    signatureInput?: Record<string, unknown>,
    postExecutionValidator?: ((envelope: ConformanceToolResultEnvelope) => Promise<void>),
    callContext?: {
      ownerKey?: string;
      providerSessionKey?: string;
      callerSessionId?: string;
    },
  ): Promise<ConformanceToolResultEnvelope>;
  snapshot(): ConformanceBrokerSnapshot;
}

export interface BrokerConformanceCodes {
  requestKeyRequired: string;
  requestKeyConflict: string;
  ambiguousTool: string;
  stopUnconfirmed: string;
}

export interface BrokerConformanceAdapter {
  createBroker(providers: ConformanceToolProvider[]): ConformanceBroker;
  createError(
    code: string,
    message: string,
    options: { operationApplied: ConformanceOperationApplied },
  ): Error;
  isErrorCode(error: unknown, code: string): boolean;
  codes: BrokerConformanceCodes;
}

export declare const brokerConformanceTestCount: 14;
export declare function registerBrokerConformanceTests(adapter: BrokerConformanceAdapter): void;
