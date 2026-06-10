export interface IAuthTokenStore {
  save(jti: string, userId: string): Promise<void>;
  getUserId(jti: string): Promise<string | null>;
  revoke(jti: string): Promise<void>;
}

export const AUTH_TOKEN_STORE = Symbol('AUTH_TOKEN_STORE');
