export interface SharedOAuthProviderOptions {
  providerId: string;
  redirectUrl: string;
  statePath: string;
  resourceUrl?: string;
}

export interface SharedOAuthProvider {
  saveClientInformation(value: { client_id: string; [key: string]: unknown }): Promise<void>;
  saveTokens(value: {
    access_token: string;
    token_type: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    [key: string]: unknown;
  }): Promise<void>;
  clientInformation(): Promise<{ client_id?: string; [key: string]: unknown } | undefined>;
  tokens(): Promise<{ refresh_token?: string; [key: string]: unknown } | undefined>;
  state(): string;
  consumeState(state: string): void;
  validateResourceURL(localTransportUrl: string, resourceUrl?: string): Promise<URL | undefined>;
}

export interface OAuthProviderConformanceAdapter {
  fixturePrefix: string;
  createProvider(options: SharedOAuthProviderOptions): SharedOAuthProvider;
  isErrorCode(error: unknown, code: string): boolean;
  codes: {
    stateMismatch: string;
    resourceMismatch: string;
  };
}

export declare const oauthProviderConformanceTestCount: 3;
export declare function registerOAuthProviderConformanceTests(
  adapter: OAuthProviderConformanceAdapter,
): void;
