export interface ProcessSessionConformanceStore {
  start(input: Record<string, any>): Promise<any>;
  poll(selector: Record<string, any>, options: Record<string, any>): Promise<any>;
  list(selector: Record<string, any>): any;
  summary(): { running: number; [key: string]: any };
  stopWorkspace(workspaceId: string, terminate: (...args: any[]) => any): Promise<any>;
  stop(selector: Record<string, any>, terminate: (...args: any[]) => any): Promise<any>;
  close(terminate: (...args: any[]) => any): Promise<any>;
}

export interface ProcessSessionConformanceAdapter {
  createStore(): ProcessSessionConformanceStore;
  isErrorCode(error: unknown, code: string): boolean;
  codes: {
    stopUnconfirmed: string;
  };
}

export declare const processSessionConformanceTestCount: 5;
export declare function registerProcessSessionConformanceTests(
  adapter: ProcessSessionConformanceAdapter,
): void;
