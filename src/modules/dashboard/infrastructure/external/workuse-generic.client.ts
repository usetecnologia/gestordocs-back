import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  IWorkuseGenericPort,
  WorkuseGenericsResponse,
} from '../../domain/workuse-generic.port';

@Injectable()
export class WorkuseGenericClient implements IWorkuseGenericPort {
  private readonly url = 'https://secure.workuse.com/api/util/genericos.php';

  async fetchGenerics(): Promise<WorkuseGenericsResponse> {
    let response: Response;
    try {
      response = await fetch(this.url);
    } catch (err) {
      throw new InternalServerErrorException(
        `Could not reach Workuse API: ${(err as Error).message}`,
      );
    }

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Workuse API responded with status ${response.status}`,
      );
    }

    return response.json() as Promise<WorkuseGenericsResponse>;
  }
}
