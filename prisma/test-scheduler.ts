import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { UserModule } from '../src/modules/user/user.module';
import { BulkInfoParticipantsSchedulerService } from '../src/modules/user/application/services/bulk-info-participants.scheduler.service';
import { WorkuseService } from '../src/shared/workuse/workuse.service';
import { EmailDispatchService } from '../src/modules/email-template/application/services/email-dispatch.service';
import type { WorkuseParticipant } from '../src/shared/workuse/interfaces/workuse-participant.interface';

// Valida que BulkInfoParticipantsSchedulerService (el job de las 2am) se resuelva bien vía DI
// y corra correctamente. Llama handleDailySync() directamente (sin esperar al cron real) contra
// una muestra chica de la BD de test. Los correos a participantes se stubean (para detectar si
// alguno se intenta enviar pese a suppressParticipantEmail=true) — el correo real al admin se
// deja pasar, igual que en el test anterior.

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

let participantEmailAttempts = 0;

class SpyEmailDispatchService {
  async dispatchByActionCode(actionCode: string, context: { userId?: string }): Promise<void> {
    participantEmailAttempts++;
    console.log(`  [ALERTA] Se intentó enviar correo a participante pese a suppressParticipantEmail=true: actionCode=${actionCode} userId=${context.userId ?? 'N/A'}`);
  }
}

async function main() {
  console.log(`Test scheduler diario — muestra de ${SAMPLE_SIZE} participantes.\n`);

  const moduleRef = await Test.createTestingModule({ imports: [UserModule] })
    .overrideProvider(EmailDispatchService)
    .useValue(new SpyEmailDispatchService())
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

    const scheduler = app.get(BulkInfoParticipantsSchedulerService);
    console.log('Llamando handleDailySync() directamente (simulando el disparo del cron)...\n');
    const t0 = Date.now();
    await scheduler.handleDailySync();
    console.log(`\nJob terminó en ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
    console.log(`Intentos de correo a participante detectados: ${participantEmailAttempts} (debe ser 0).`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Error en el test:', err);
  process.exit(1);
});
