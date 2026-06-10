import { Injectable } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from 'prisma/generated/prisma/client';
import { envs } from '@config/envs';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const adapter = new PrismaMariaDb({
      host: envs.HOST_DB,
      user: envs.USER_DB,
      password: envs.PASSWORD_DB,
      database: envs.DATABASE_DB,
      port: envs.PORT_DB,
      connectionLimit: 10,
    });
    super({ adapter });
  }
}
