import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { IAuthTokenStore } from '../../domain/auth-token-store.port';
import { envs } from '@config/envs';

@Injectable()
export class AuthTokenStoreRedis implements IAuthTokenStore {
  private readonly ttl = envs.JWT_REFRESH_TTL_MS;
  private readonly key = (jti: string) => `auth:refresh:${jti}`;

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async save(jti: string, userId: string): Promise<void> {
    await this.cache.set(this.key(jti), userId, this.ttl);
  }

  async getUserId(jti: string): Promise<string | null> {
    return (await this.cache.get<string>(this.key(jti))) ?? null;
  }

  async revoke(jti: string): Promise<void> {
    await this.cache.del(this.key(jti));
  }
}
