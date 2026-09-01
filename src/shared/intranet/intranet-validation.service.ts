import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { envs } from '@config/envs';
import type { IntranetUser } from './interfaces/intranet-user.interface';

const REJECTED_MESSAGE = 'Debes ingresar a través de la intranet para acceder a esta plataforma.';

@Injectable()
export class IntranetValidationService {
  private readonly logger = new Logger(IntranetValidationService.name);

  async validate(email: string): Promise<IntranetUser> {
    let response: Response;
    try {
      response = await fetch(envs.INTRANET_VALIDATION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, bearer: envs.INTRANET_VALIDATION_TOKEN }),
      });
    } catch (err) {
      this.logger.error('Error al conectar con la API de la intranet', err as Error);
      throw new ForbiddenException(REJECTED_MESSAGE);
    }

    const raw = (await response.json().catch(() => null)) as IntranetUser | null;

    if (!response.ok || !raw?.isActive || raw.email !== email) {
      throw new ForbiddenException(REJECTED_MESSAGE);
    }

    return raw;
  }
}
