export type SharedAuditDecision = "allow" | "deny" | "quarantine" | "error";

export interface AuditClassificationConformanceAdapter {
  errorPrefix: string;
  classify(code: string): SharedAuditDecision;
}

export declare const auditClassificationConformanceTestCount: 1;
export declare function registerAuditClassificationConformanceTests(
  adapter: AuditClassificationConformanceAdapter,
): void;
