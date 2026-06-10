export interface IPasswordVerifier {
  compare(plain: string, hash: string): Promise<boolean>;
}

export const PASSWORD_VERIFIER = Symbol('PASSWORD_VERIFIER');
