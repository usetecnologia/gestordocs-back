import { Module } from '@nestjs/common';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { AdminRoleGuard } from '@common/guards/admin-role.guard';
import { SQL_GENERATOR_PORT } from './domain/sql-generator.port';
import { READ_ONLY_QUERY_PORT } from './domain/read-only-query.port';
import { OpenAiSqlGeneratorClient } from './infrastructure/external/openai-sql-generator.client';
import { ReadOnlyQueryPrismaRepository } from './infrastructure/persistence/read-only-query.prisma.repository';
import { AiQueryController } from './infrastructure/http/ai-query.controller';
import { RunNlQueryUseCase } from './application/use-cases/run-nl-query.use-case';

@Module({
  imports: [AppJwtModule],
  controllers: [AiQueryController],
  providers: [
    RunNlQueryUseCase,
    { provide: SQL_GENERATOR_PORT, useClass: OpenAiSqlGeneratorClient },
    { provide: READ_ONLY_QUERY_PORT, useClass: ReadOnlyQueryPrismaRepository },
    JwtAuthGuard,
    AdminRoleGuard,
  ],
})
export class AiQueryModule {}
