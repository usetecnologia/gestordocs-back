import type { AuthorizationTokenEnum } from '@common/enums/authorization-token.enum';

export interface CreateRedisInterface {
  userId: string;
  type: AuthorizationTokenEnum;
  ttl?: number;
}

export interface PayloadRedisInterface {
  userId: string;
  type: AuthorizationTokenEnum;
  token: string;
}

export interface RevokeRedisInterface {
  userId: string;
  type: AuthorizationTokenEnum;
}
