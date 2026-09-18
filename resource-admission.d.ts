export interface ResourceHistoryConformanceStore {
  observe(workloadKey: string, peakWorkingSetBytes: number): Promise<boolean>;
  estimate(workloadKey: string): Promise<number>;
  summary(): Promise<Record<string, any>>;
}

export interface ResourceAdmissionConformanceAdapter {
  fixturePrefix: string;
  evaluateAdmission(capture: Record<string, any>, options?: Record<string, any>): Record<string, any>;
  createHistoryStore(options: { stateDir: string; providerId: string }): ResourceHistoryConformanceStore;
  schemas: {
    capture: string;
    processTree: string;
    host: string;
    admission: string;
    history: string;
  };
}

export declare const resourceAdmissionConformanceTestCount: 3;
export declare function registerResourceAdmissionConformanceTests(
  adapter: ResourceAdmissionConformanceAdapter,
): void;
