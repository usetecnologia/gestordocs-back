import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { AwsS3Module } from '@shared/aws/aws-s3.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { USER_DOCUMENTS_REPOSITORY } from '@modules/user-documents/domain/user-documents.repository';
import { UserDocumentsPrismaRepository } from '@modules/user-documents/infrastructure/persistence/user-documents.prisma.repository';
import { SPONSOR_PACKAGE_REPOSITORY } from './domain/sponsor-package.repository';
import { SponsorPackagePrismaRepository } from './infrastructure/persistence/sponsor-package.prisma.repository';
import { SponsorPackageController } from './infrastructure/http/sponsor-package.controller';
import { SponsorPackagePlanner } from './application/services/sponsor-package-planner.service';
import { PreviewSponsorPackageUseCase } from './application/use-cases/preview-sponsor-package.use-case';
import { FindRequiredInputsUseCase } from './application/use-cases/find-required-inputs.use-case';
import {
  CreateSponsorPackageUseCase,
  DeleteSponsorPackageUseCase,
  DuplicateSponsorPackageUseCase,
  FindAllSponsorPackagesUseCase,
  FindOneSponsorPackageUseCase,
  UpdateSponsorPackageOutputsOrderUseCase,
  UpdateSponsorPackageUseCase,
} from './application/use-cases/crud-sponsor-package.use-cases';

/**
 * Paquetes de descarga por sponsor.
 *
 * Provee `USER_DOCUMENTS_REPOSITORY` directamente en vez de importar `UserDocumentsModule`: ese
 * módulo ya importa a este (necesita el motor de armado), así que importarlo de vuelta sería un
 * ciclo. Es el mismo patrón con el que `UserDocumentsModule` provee `DOCUMENT_REPOSITORY`.
 */
@Module({
  imports: [PrismaModule, AppJwtModule, AwsS3Module],
  controllers: [SponsorPackageController],
  providers: [
    FindAllSponsorPackagesUseCase,
    FindOneSponsorPackageUseCase,
    CreateSponsorPackageUseCase,
    UpdateSponsorPackageUseCase,
    DeleteSponsorPackageUseCase,
    DuplicateSponsorPackageUseCase,
    UpdateSponsorPackageOutputsOrderUseCase,
    PreviewSponsorPackageUseCase,
    FindRequiredInputsUseCase,
    SponsorPackagePlanner,
    { provide: SPONSOR_PACKAGE_REPOSITORY, useClass: SponsorPackagePrismaRepository },
    { provide: USER_DOCUMENTS_REPOSITORY, useClass: UserDocumentsPrismaRepository },
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [SPONSOR_PACKAGE_REPOSITORY, SponsorPackagePlanner, FindRequiredInputsUseCase],
})
export class SponsorPackageModule {}
