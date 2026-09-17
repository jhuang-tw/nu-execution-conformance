export type ConformanceOperationApplied = "yes" | "no" | "unknown";

export interface ConformanceRuntimeError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly operationApplied: ConformanceOperationApplied;
  readonly details: Record<string, unknown>;
  readonly cause?: unknown;
  toJSON(): Record<string, unknown>;
}

export interface ErrorContractConformanceAdapter {
  normalize(error: unknown): ConformanceRuntimeError;
  createError(
    code: string,
    message: string,
    options?: {
      retryable?: boolean;
      operationApplied?: ConformanceOperationApplied;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ): ConformanceRuntimeError;
}

export declare const errorContractConformanceTestCount: 6;
export declare function registerErrorContractConformanceTests(
  adapter: ErrorContractConformanceAdapter,
): void;
