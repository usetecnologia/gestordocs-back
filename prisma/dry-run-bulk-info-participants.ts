import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { UserModule } from '../src/modules/user/user.module';
import { BulkInfoParticipantsUseCase } from '../src/modules/user/application/use-cases/bulk-info-participants.use-case';
import { WorkuseService } from '../src/shared/workuse/workuse.service';
import { EmailDispatchService } from '../src/modules/email-template/application/services/email-dispatch.service';
import type { WorkuseParticipant } from '../src/shared/workuse/interfaces/workuse-participant.interface';

// Script de un solo uso para validar BulkInfoParticipantsUseCase contra la BD real con una
// muestra chica antes de correr el batch completo. Arma el mismo grafo de DI que usa la app
// (UserModule real, misma configuración) pero:
//   1. Reemplaza EmailDispatchService por un stub que solo loguea — no se envía ningún correo real.
//   2. Envuelve WorkuseService para devolver solo los primeros SAMPLE_SIZE participantes que ya
//      matchean Perú + WAT USA (mismo criterio que usa el use case), en vez de los ~2150 reales.
// No modifica ningún archivo de src/ — es completamente aparte del código de producción.

const SAMPLE_SIZE = Number(process.argv[2] ?? 20);

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
    console.log(`  [email suprimido] actionCode=${actionCode} userId=${context.userId ?? 'N/A'}`);
  }
}

async function main() {
  console.log(`Dry-run BulkInfoParticipants — muestra de ${SAMPLE_SIZE} participantes (Perú + WAT USA).\n`);

  const moduleRef = await Test.createTestingModule({
    imports: [UserModule],
  })
    .overrideProvider(EmailDispatchService)
    .useValue(new NoEmailDispatchService())
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  try {
    const workuseService = app.get(WorkuseService);
    const original = workuseService.fetchParticipantsBulkV2.bind(workuseService);

    workuseService.fetchParticipantsBulkV2 = async () => {
      const all = await original();
      const target = all.filter(isTargetParticipant).slice(0, SAMPLE_SIZE);
      console.log(`Workuse devolvió ${all.length} participantes en total; usando muestra de ${target.length} (Perú + WAT USA).\n`);
      return target;
    };

    const bulkInfoParticipants = app.get(BulkInfoParticipantsUseCase);
    const result = await bulkInfoParticipants.execute();

    console.log('\n=== Resultado del dry-run ===');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Error en el dry-run:', err);
  process.exit(1);
});
