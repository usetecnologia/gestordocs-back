import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { UserModule } from '../src/modules/user/user.module';
import { UserController } from '../src/modules/user/infrastructure/http/user.controller';
import {
  BulkInfoParticipantsUseCase,
  BulkInfoParticipantsResult,
} from '../src/modules/user/application/use-cases/bulk-info-participants.use-case';
import { WorkuseService } from '../src/shared/workuse/workuse.service';
import { EmailDispatchService } from '../src/modules/email-template/application/services/email-dispatch.service';
import type { WorkuseParticipant } from '../src/shared/workuse/interfaces/workuse-participant.interface';

// Valida el comportamiento fire-and-forget del endpoint bulk-info-participants:
//   1. El handler del controller debe responder casi de inmediato (no espera el batch).
//   2. El job sigue corriendo en background y termina solo.
//   3. Al terminar, se notifica por correo real al admin (ResendService, sin stub).
// Los correos a PARTICIPANTES (EmailDispatchService, por transición a OBSERVADO) sí se
// suprimen, igual que en las pruebas anteriores — no queremos volver a spamear participantes.

const SAMPLE_SIZE = Number(process.argv[2] ?? 15);

const TARGET_COUNTRY_ID = '2';
const TARGET_COUNTRY_NAME = 'PERU';
const TARGET_PROGRAM_ID = '1';
const TARGET_PROGRAM_NAME = 'WAT USA';

function matchesTarget(
  id: string | undefined,
  targetId: string,
  name: string | null | undefined,
  targetName: string,
): boolean {
  const normalizedId = id?.trim();
  if (normalizedId) return normalizedId === targetId;
  return (name ?? '').trim().toUpperCase() === targetName;
}

function isTargetParticipant(data: WorkuseParticipant): boolean {
  const isPeru = matchesTarget(data.countryId, TARGET_COUNTRY_ID, data.country, TARGET_COUNTRY_NAME);
  const isWatUsa = matchesTarget(data.programId, TARGET_PROGRAM_ID, data.program, TARGET_PROGRAM_NAME);
  return isPeru && isWatUsa;
}

class NoEmailDispatchService {
  async dispatchByActionCode(actionCode: string, context: { userId?: string }): Promise<void> {
    console.log(`  [email participante suprimido] actionCode=${actionCode} userId=${context.userId ?? 'N/A'}`);
  }
}

async function main() {
  console.log(`Test fire-and-forget — muestra de ${SAMPLE_SIZE} participantes.`);
  console.log(`El correo de resumen al admin (${process.env.ADMIN_EMAIL}) SÍ se enviará real.\n`);

  const moduleRef = await Test.createTestingModule({ imports: [UserModule] })
    .overrideProvider(EmailDispatchService)
    .useValue(new NoEmailDispatchService())
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  try {
    const workuseService = app.get(WorkuseService);
    const originalFetch = workuseService.fetchParticipantsBulkV2.bind(workuseService);
    workuseService.fetchParticipantsBulkV2 = async () => {
      const all = await originalFetch();
      const target = all.filter(isTargetParticipant).slice(0, SAMPLE_SIZE);
      console.log(`Muestra tomada: ${target.length} participantes (de ${all.length} totales).`);
      return target;
    };

    const bulkUseCase = app.get(BulkInfoParticipantsUseCase);
    const originalExecute = bulkUseCase.execute.bind(bulkUseCase);
    let backgroundPromise: Promise<BulkInfoParticipantsResult> | undefined;
    bulkUseCase.execute = () => {
      backgroundPromise = originalExecute();
      return backgroundPromise;
    };

    const controller = app.get(UserController);

    console.log('Llamando al handler del controller (debe responder casi de inmediato)...');
    const t0 = Date.now();
    const response = controller.bulkInfoParticipantsHandler();
    const t1 = Date.now();
    console.log(`Respuesta HTTP inmediata en ${t1 - t0}ms:`, response);

    console.log('\nEsperando a que el job en background termine (solo para el test — en prod nadie espera esto)...');
    const bgStart = Date.now();
    await backgroundPromise;
    console.log(`\nJob en background terminó en ${((Date.now() - bgStart) / 1000).toFixed(1)}s.`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Error en el test:', err);
  process.exit(1);
});
