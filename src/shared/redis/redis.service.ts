import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from '@nestjs/cache-manager';
import type { AuthorizationTokenEnum } from '@common/enums/authorization-token.enum';
import type {
  CreateRedisInterface,
  PayloadRedisInterface,
  RevokeRedisInterface,
} from './interfaces/redis.interface';

@Injectable()
export class RedisService {
  private readonly randomToken = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

  private readonly getKey = (type: AuthorizationTokenEnum, userId: string) =>
    `token:${type}:user:${userId}`;

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async generateToken({
    userId,
    type,
    ttl = 900000,
  }: CreateRedisInterface): Promise<string> {
    const token = this.randomToken();
    await this.cacheManager.set(this.getKey(type, userId), token, ttl);
    return token;
  }

  async validateToken({
    userId,
    type,
    token,
  }: PayloadRedisInterface): Promise<boolean> {
    const stored = await this.cacheManager.get<string>(
      this.getKey(type, userId),
    );
    return stored === token;
  }

  async revokeToken({ userId, type }: RevokeRedisInterface): Promise<boolean> {
    await this.cacheManager.del(this.getKey(type, userId));
    return true;
  }
}
