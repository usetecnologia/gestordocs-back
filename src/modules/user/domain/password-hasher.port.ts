export interface IPasswordHasher {
  hash(value: string): Promise<string>;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
