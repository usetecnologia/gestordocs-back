import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@shared/prisma/prisma.service';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import { ResendService } from '@shared/resend/resend.service';
import { SponsorPackageModule } from './sponsor-package.module';
import { UserDocumentsModule } from '@modules/user-documents/user-documents.module';
import { SPONSOR_PACKAGE_REPOSITORY } from './domain/sponsor-package.repository';
import { SponsorPackagePlanner } from './application/services/sponsor-package-planner.service';
import { PreviewSponsorPackageUseCase } from './application/use-cases/preview-sponsor-package.use-case';
import { SponsorPackageController } from './infrastructure/http/sponsor-package.controller';
import { SponsorPackageEngine } from '@modules/user-documents/application/services/sponsor-package-engine.service';
import { SponsorDocumentBuilder } from '@modules/user-documents/application/services/sponsor-document-builder.service';

/**
 * El grafo de inyección tiene que armarse. Es la clase de error que TypeScript no ve: un provider
 * que falta o un ciclo entre módulos compilan perfecto y revientan al arrancar la app.
 *
 * Acá hay un riesgo concreto de ciclo: `UserDocumentsModule` importa `SponsorPackageModule` (necesita
 * el planificador), y `SponsorPackageModule` necesita el repositorio de user-documents. Se resuelve
 * proveyendo `UserDocumentsPrismaRepository` directamente en vez de importar el módulo de vuelta —
 * el mismo patrón con el que `UserDocumentsModule` provee `DOCUMENT_REPOSITORY`. Este test es lo que
 * garantiza que esa decisión siga funcionando.
 *
 * Los clientes de infraestructura se sustituyen por dobles vacíos. No es cosmético: `.compile()`
 * instancia TODOS los providers, y `PrismaService` abre un pool contra la base real en su
 * constructor. Sin estos overrides el test se conectaba al servidor remoto, tardaba minutos y
 * dejaba sin CPU al resto de la suite.
 */
async function compilar(imports: unknown[]): Promise<TestingModule> {
  return Test.createTestingModule({ imports: imports as never })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(AwsS3Service)
    .useValue({})
    .overrideProvider(ResendService)
    .useValue({})
    .compile();
}

describe('SponsorPackageModule — grafo de inyección', () => {
  it('resuelve todos sus providers sin depender de UserDocumentsModule', async () => {
    // Que compile solo es lo que prueba que la decisión anti-ciclo funciona: el módulo se basta
    // proveyendo el repositorio de user-documents por su cuenta.
    const moduleRef = await compilar([SponsorPackageModule]);

    expect(moduleRef.get(SPONSOR_PACKAGE_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(SponsorPackagePlanner)).toBeDefined();
    expect(moduleRef.get(PreviewSponsorPackageUseCase)).toBeDefined();
    expect(moduleRef.get(SponsorPackageController)).toBeDefined();

    await moduleRef.close();
  });

  it('convive con UserDocumentsModule sin ciclo de dependencias', async () => {
    const moduleRef = await compilar([SponsorPackageModule, UserDocumentsModule]);

    // El motor vive en user-documents y consume el planificador que exporta sponsor-package.
    expect(moduleRef.get(SponsorPackageEngine)).toBeDefined();
    // El camino histórico sigue disponible: es el activo mientras la flag esté apagada.
    expect(moduleRef.get(SponsorDocumentBuilder)).toBeDefined();

    await moduleRef.close();
  });
});
