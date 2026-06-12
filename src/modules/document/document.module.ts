import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { DOCUMENT_REPOSITORY } from './domain/document.repository';
import { DocumentPrismaRepository } from './infrastructure/persistence/document.prisma.repository';
import { DocumentController } from './infrastructure/http/document.controller';
import { CreateDocumentUseCase } from './application/use-cases/create-document.use-case';
import { FindAllDocumentUseCase } from './application/use-cases/find-all-document.use-case';
import { FindOneDocumentUseCase } from './application/use-cases/find-one-document.use-case';
import { UpdateDocumentUseCase } from './application/use-cases/update-document.use-case';
import { DeleteDocumentUseCase } from './application/use-cases/delete-document.use-case';

const useCases = [
  CreateDocumentUseCase,
  FindAllDocumentUseCase,
  FindOneDocumentUseCase,
  UpdateDocumentUseCase,
  DeleteDocumentUseCase,
];

@Module({
  imports: [PrismaModule, AppJwtModule],
  controllers: [DocumentController],
  providers: [
    ...useCases,
    { provide: DOCUMENT_REPOSITORY, useClass: DocumentPrismaRepository },
    JwtAuthGuard,
  ],
})
export class DocumentModule {}
