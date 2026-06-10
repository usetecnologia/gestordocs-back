import type { AuthCredentials } from './auth-credentials';

export interface IAuthRepository {
  findByEmail(email: string): Promise<AuthCredentials | null>;
  findByUsername(username: string): Promise<AuthCredentials | null>;
}

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');
