import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'crypto';
import type { WorkuseParticipant } from './interfaces/workuse-participant.interface';

const WORKUSE_BASE_URL = 'https://secure.workuse.com';
const WORKUSE_USER_PATH = '/api/user/user.php';
const WORKUSE_BULK_PATH = '/api/user/userinfo.php';
const WORKUSE_BULK_V2_PATH = '/api/user/userinfo2.php';

const WORKUSE_API_KEY = 'nexsys-01-app';
const WORKUSE_API_SECRET =
  'f8c2e131e76d7c4f37b24a6fdd2b83c3c252740268de5f83b0c80abc1330b';

@Injectable()
export class WorkuseService {
  private readonly logger = new Logger(WorkuseService.name);

  async fetchParticipant(dni: string): Promise<WorkuseParticipant> {
    let response: Response;
    try {
      response = await fetch(`${WORKUSE_BASE_URL}${WORKUSE_USER_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni }),
      });
    } catch (err) {
      this.logger.error('Error al conectar con Workuse (user.php)', err as Error);
      throw new ServiceUnavailableException('No se pudo conectar con el servicio externo.');
    }

    const raw = (await response.json().catch(() => null)) as WorkuseParticipant | null;

    if (!response.ok || !raw?.valid) {
      throw new NotFoundException('Usuario no encontrado en Workuse.');
    }

    return raw;
  }

  async fetchParticipantsBulk(): Promise<WorkuseParticipant[]> {
    let response: Response;
    try {
      response = await fetch(`${WORKUSE_BASE_URL}${WORKUSE_BULK_PATH}`);
    } catch (err) {
      this.logger.error('Error al conectar con Workuse (userinfo.php)', err as Error);
      throw new ServiceUnavailableException('No se pudo conectar con el servicio externo.');
    }

    const raw = (await response.json().catch(() => null)) as WorkuseParticipant[] | null;
    if (!response.ok || !Array.isArray(raw)) {
      throw new ServiceUnavailableException('Respuesta inválida del servicio externo.');
    }

    return raw;
  }

  async fetchParticipantsBulkV2(): Promise<WorkuseParticipant[]> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = `${WORKUSE_API_KEY}|${timestamp}|GET|${WORKUSE_BULK_V2_PATH}`;
    const signature = createHmac('sha256', WORKUSE_API_SECRET).update(payload).digest('hex');

    let response: Response;
    try {
      response = await fetch(`${WORKUSE_BASE_URL}${WORKUSE_BULK_V2_PATH}`, {
        method: 'GET',
        headers: {
          'X-API-Key': WORKUSE_API_KEY,
          'X-Timestamp': timestamp,
          'X-Signature': signature,
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      this.logger.error('Error al conectar con Workuse (userinfo2.php)', err as Error);
      throw new ServiceUnavailableException('No se pudo conectar con el servicio externo.');
    }

    const raw = (await response.json().catch(() => null)) as WorkuseParticipant[] | null;
    if (!response.ok || !Array.isArray(raw)) {
      throw new ServiceUnavailableException('Respuesta inválida del servicio externo.');
    }

    return raw;
  }
}
