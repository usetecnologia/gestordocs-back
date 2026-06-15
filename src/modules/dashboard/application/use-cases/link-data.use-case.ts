import { Inject, Injectable } from '@nestjs/common';
import {
  IWorkuseGenericPort,
  WorkuseCountry,
  WorkuseProgram,
  WorkuseSponsor,
  WORKUSE_GENERIC_PORT,
} from '../../domain/workuse-generic.port';
import {
  ICountryRepository,
  COUNTRY_REPOSITORY,
} from '@modules/country/domain/country.repository';
import {
  IProgramRepository,
  PROGRAM_REPOSITORY,
} from '@modules/program/domain/program.repository';
import {
  ISponsorRepository,
  SPONSOR_REPOSITORY,
} from '@modules/sponsor/domain/sponsor.repository';

export interface SyncEntityResult {
  created: number;
  updated: number;
}

export interface SyncDataResult {
  countries: SyncEntityResult;
  programs: SyncEntityResult;
  sponsors: SyncEntityResult;
}

@Injectable()
export class LinkDataUseCase {
  constructor(
    @Inject(WORKUSE_GENERIC_PORT)
    private readonly workuseGenericPort: IWorkuseGenericPort,
    @Inject(COUNTRY_REPOSITORY)
    private readonly countryRepository: ICountryRepository,
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: IProgramRepository,
    @Inject(SPONSOR_REPOSITORY)
    private readonly sponsorRepository: ISponsorRepository,
  ) {}

  async execute(): Promise<SyncDataResult> {
    const externalData = await this.workuseGenericPort.fetchGenerics();

    const [countries, programs, sponsors] = await Promise.all([
      this.syncCountries(externalData.countries),
      this.syncPrograms(externalData.programs),
      this.syncSponsors(externalData.sponsor),
    ]);

    const result: SyncDataResult = { countries, programs, sponsors };
    console.log('[LinkData] Sync completed:', JSON.stringify(result, null, 2));
    return result;
  }

  private async syncCountries(external: WorkuseCountry[]): Promise<SyncEntityResult> {
    const local = await this.countryRepository.findAllForSync();

    const byIdExterno = new Map(
      local.filter((c) => c.idExterno).map((c) => [c.idExterno!, c]),
    );
    const byCode = new Map(
      local.filter((c) => c.code).map((c) => [c.code, c]),
    );

    let created = 0;
    let updated = 0;

    for (const ext of external) {
      if (!ext.code?.trim()) continue;

      const idExternoStr = String(ext.id);
      const existing = byIdExterno.get(idExternoStr) ?? byCode.get(ext.code);

      if (existing) {
        await this.countryRepository.update(existing.id, {
          name: ext.name,
          idExterno: idExternoStr,
        });
        updated++;
      } else {
        await this.countryRepository.create({
          idExterno: idExternoStr,
          code: ext.code,
          name: ext.name,
        });
        created++;
      }
    }

    return { created, updated };
  }

  private async syncPrograms(external: WorkuseProgram[]): Promise<SyncEntityResult> {
    const local = await this.programRepository.findAllForSync();

    const byIdExterno = new Map(
      local.filter((p) => p.idExterno).map((p) => [p.idExterno!, p]),
    );
    const byCode = new Map(local.map((p) => [p.code, p]));

    let created = 0;
    let updated = 0;

    for (const ext of external) {
      const idExternoStr = String(ext.id);
      // Strip HTML tags that may appear in program names (e.g. <b>Work and Travel USA</b>)
      const cleanName = ext.name.replace(/<[^>]*>/g, '').trim();
      const existing = byIdExterno.get(idExternoStr) ?? byCode.get(ext.short);

      if (existing) {
        await this.programRepository.update(existing.id, {
          name: cleanName,
          code: ext.short,
          idExterno: idExternoStr,
        });
        updated++;
      } else {
        await this.programRepository.create({
          idExterno: idExternoStr,
          code: ext.short,
          name: cleanName,
        });
        created++;
      }
    }

    return { created, updated };
  }

  private async syncSponsors(external: WorkuseSponsor[]): Promise<SyncEntityResult> {
    const local = await this.sponsorRepository.findAllForSync();

    const byIdExterno = new Map(
      local.filter((s) => s.idExterno).map((s) => [s.idExterno!, s]),
    );
    // Case-insensitive name lookup
    const byName = new Map(local.map((s) => [s.name.toLowerCase(), s]));

    let created = 0;
    let updated = 0;

    for (const ext of external) {
      const idExternoStr = String(ext.id);
      const existing =
        byIdExterno.get(idExternoStr) ?? byName.get(ext.name.toLowerCase());

      if (existing) {
        await this.sponsorRepository.update(existing.id, {
          name: ext.name,
          idExterno: idExternoStr,
        });
        updated++;
      } else {
        // Sponsors have no separate code in the external API — use name as code
        await this.sponsorRepository.create({
          idExterno: idExternoStr,
          code: ext.name,
          name: ext.name,
        });
        created++;
      }
    }

    return { created, updated };
  }
}
