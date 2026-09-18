export type PublicTunnelProvider = "cloudflare" | "ngrok";

export interface PublicTunnelConformanceAdapter {
  productName: string;
  productId: string;
  schemas: {
    health: string;
    ready: string;
  };
  extractPublicTunnelUrl(provider: PublicTunnelProvider, text: string): string | undefined;
  inspectPublicTunnelReadiness(options: Record<string, any>): Promise<Record<string, any>>;
  inspectExternalReadiness(options: {
    publicBaseUrl: string;
    fetchFn?: typeof fetch;
    timeoutMs?: number;
  }): Promise<Record<string, any>>;
}

export declare const publicTunnelConformanceTestCount: 4;
export declare function registerPublicTunnelConformanceTests(
  adapter: PublicTunnelConformanceAdapter,
): void;
