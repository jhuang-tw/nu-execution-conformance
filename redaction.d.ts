export interface ConformanceAuditRecord extends Record<string, unknown> {
  decision?: unknown;
}

export interface ConformanceAuditSink {
  readonly records: ConformanceAuditRecord[];
  append(record: ConformanceAuditRecord): void | Promise<void>;
}

export interface RedactionConformanceAdapter {
  redactString(value: string): string;
  redactValue(value: unknown): unknown;
  createAuditSink(): ConformanceAuditSink;
}

export declare const redactionConformanceTestCount: 2;
export declare function registerRedactionConformanceTests(adapter: RedactionConformanceAdapter): void;
