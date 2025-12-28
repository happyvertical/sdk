/**
 * Type declarations for intuit-oauth
 *
 * The intuit-oauth package doesn't ship with TypeScript types,
 * so we declare the minimal interface we need.
 */

declare module 'intuit-oauth' {
  export interface OAuthClientConfig {
    clientId: string;
    clientSecret: string;
    environment: 'sandbox' | 'production';
    redirectUri: string;
  }

  export interface TokenData {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    x_refresh_token_expires_in?: number;
    id_token?: string;
  }

  export interface TokenResponse {
    getJson(): TokenData;
    getToken(): TokenData;
  }

  export default class OAuthClient {
    constructor(config: OAuthClientConfig);

    setToken(token: { access_token: string; refresh_token: string }): void;

    refresh(): Promise<TokenResponse>;

    refreshUsingToken(refreshToken: string): Promise<TokenResponse>;

    getToken(): TokenData;

    isAccessTokenValid(): boolean;

    authorizeUri(params: {
      scope: string | string[];
      state?: string;
    }): string;

    createToken(url: string): Promise<TokenResponse>;

    revoke(params?: { access_token?: string; refresh_token?: string }): Promise<void>;
  }
}
