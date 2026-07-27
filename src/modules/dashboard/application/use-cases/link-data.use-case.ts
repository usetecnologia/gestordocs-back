import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IWorkuseGenericPort,
  WorkuseCountry,
  WorkuseProgram,
  WorkuseSponsor,
  WorkuseOptionProgram,
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
import {
  IOptionProgramRepository,
  OPTION_PROGRAM_REPOSITORY,
} from '@modules/option-program/domain/option-program.repository';

// Case-insensitive code comparison so a pre-existing record without idExterno
// (e.g. "Wat USA" vs "WAT USA") gets linked to the external id instead of spawning a duplicate.
function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export interface SyncEntityResult {
  created: number;
  updated: number;
  failed: number;
}

export interface SyncDataResult {
  countries: SyncEntityResult;
  programs: SyncEntityResult;
  sponsors: SyncEntityResult;
  optionPrograms: SyncEntityResult;
}

@Injectable()
export class LinkDataUseCase {
  private readonly logger = new Logger(LinkDataUseCase.name);

  constructor(
    @Inject(WORKUSE_GENERIC_PORT)
    private readonly workuseGenericPort: IWorkuseGenericPort,
    @Inject(COUNTRY_REPOSITORY)
    private readonly countryRepository: ICountryRepository,
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: IProgramRepository,
    @Inject(SPONSOR_REPOSITORY)
    private readonly sponsorRepository: ISponsorRepository,
    @Inject(OPTION_PROGRAM_REPOSITORY)
    private readonly optionProgramRepository: IOptionProgramRepository,
  ) {}

  async execute(): Promise<SyncDataResult> {
    const externalData = await this.workuseGenericPort.fetchGenerics();

    const [countries, programs, sponsors] = await Promise.all([
      this.syncCountries(externalData.countries),
      this.syncPrograms(externalData.programs),
      this.syncSponsors(externalData.sponsor),
    ]);

    // Los option programs se sincronizan después: dependen de country/program ya sincronizados
    // porque resuelven sus FK contra la BD por idExterno.
    const optionPrograms = await this.syncOptionPrograms(externalData.optionPrograms);

    const result: SyncDataResult = { countries, programs, sponsors, optionPrograms };
    console.log('[LinkData] Sync completed:', JSON.stringify(result, null, 2));
    return result;
  }

  private async syncCountries(external: WorkuseCountry[]): Promise<SyncEntityResult> {
    const local = await this.countryRepository.findAllForSync();

    const byIdExterno = new Map(
      local.filter((c) => c.idExterno).map((c) => [c.idExterno!, c]),
    );
    const byCode = new Map(
      local.filter((c) => c.code).map((c) => [normalizeCode(c.code), c]),
    );

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const ext of external) {
      if (!ext.code?.trim()) continue;

      const idExternoStr = String(ext.id);
      const normalizedCode = normalizeCode(ext.code);
      const existing = byIdExterno.get(idExternoStr) ?? byCode.get(normalizedCode);

      try {
        if (existing) {
          const row = await this.countryRepository.update(existing.id, {
            name: ext.name,
            idExterno: idExternoStr,
          });
          byIdExterno.set(idExternoStr, row);
          byCode.set(normalizedCode, row);
          updated++;
        } else {
          const row = await this.countryRepository.create({
            idExterno: idExternoStr,
            code: ext.code,
            name: ext.name,
          });
          byIdExterno.set(idExternoStr, row);
          byCode.set(normalizedCode, row);
          created++;
        }
      } catch (err) {
        failed++;
        this.logger.error(
          `Failed to sync country id=${ext.id} code="${ext.code}": ${(err as Error).message}`,
        );
      }
    }

    return { created, updated, failed };
  }

  private async syncPrograms(external: WorkuseProgram[]): Promise<SyncEntityResult> {
    const local = await this.programRepository.findAllForSync();

    const byIdExterno = new Map(
      local.filter((p) => p.idExterno).map((p) => [p.idExterno!, p]),
    );
    const byCode = new Map(local.map((p) => [normalizeCode(p.code), p]));

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const ext of external) {
      const idExternoStr = String(ext.id);
      // Strip HTML tags that may appear in program names (e.g. <b>Work and Travel USA</b>)
      const cleanName = ext.name.replace(/<[^>]*>/g, '').trim();
      const normalizedCode = normalizeCode(ext.short);
      const existing = byIdExterno.get(idExternoStr) ?? byCode.get(normalizedCode);

      try {
        if (existing) {
          const row = await this.programRepository.update(existing.id, {
            name: cleanName,
            code: ext.short,
            idExterno: idExternoStr,
          });
          byIdExterno.set(idExternoStr, row);
          byCode.set(normalizedCode, row);
          updated++;
        } else {
          const row = await this.programRepository.create({
            idExterno: idExternoStr,
            code: ext.short,
            name: cleanName,
          });
          byIdExterno.set(idExternoStr, row);
          byCode.set(normalizedCode, row);
          created++;
        }
      } catch (err) {
        failed++;
        this.logger.error(
          `Failed to sync program id=${ext.id} short="${ext.short}": ${(err as Error).message}`,
        );
      }
    }

    return { created, updated, failed };
  }

  private async syncSponsors(external: WorkuseSponsor[]): Promise<SyncEntityResult> {
    const local = await this.sponsorRepository.findAllForSync();

    const byIdExterno = new Map(
      local.filter((s) => s.idExterno).map((s) => [s.idExterno!, s]),
    );
    const byName = new Map(local.map((s) => [normalizeCode(s.name), s]));

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const ext of external) {
      const idExternoStr = String(ext.id);
      const normalizedName = normalizeCode(ext.name);
      const existing = byIdExterno.get(idExternoStr) ?? byName.get(normalizedName);

      try {
        if (existing) {
          const row = await this.sponsorRepository.update(existing.id, {
            name: ext.name,
            idExterno: idExternoStr,
          });
          byIdExterno.set(idExternoStr, row);
          byName.set(normalizedName, row);
          updated++;
        } else {
          // Sponsors have no separate code in the external API — use name as code
          const row = await this.sponsorRepository.create({
            idExterno: idExternoStr,
            code: ext.name,
            name: ext.name,
          });
          byIdExterno.set(idExternoStr, row);
          byName.set(normalizedName, row);
          created++;
        }
      } catch (err) {
        failed++;
        this.logger.error(
          `Failed to sync sponsor id=${ext.id} name="${ext.name}": ${(err as Error).message}`,
        );
      }
    }

    return { created, updated, failed };
  }

  private async syncOptionPrograms(external: WorkuseOptionProgram[]): Promise<SyncEntityResult> {
    // Los option programs SOLO se identifican de forma única por su idExterno: el code
    // (short_Database) y la descripción se repiten entre muchos registros. Por eso se
    // matchea únicamente por idExterno — no hay fallback seguro por code ni por nombre.
    const [countries, programs, local] = await Promise.all([
      this.countryRepository.findAllForSync(),
      this.programRepository.findAllForSync(),
      this.optionProgramRepository.findAllForSync(),
    ]);

    // Mapas idExterno -> id local para resolver los FK country/program.
    const countryByExt = new Map(
      countries.filter((c) => c.idExterno?.trim()).map((c) => [c.idExterno!.trim(), c.id]),
    );
    const programByExt = new Map(
      programs.filter((p) => p.idExterno?.trim()).map((p) => [p.idExterno!.trim(), p.id]),
    );
    const byIdExterno = new Map(
      local.filter((o) => o.idExterno?.trim()).map((o) => [o.idExterno!.trim(), o]),
    );

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const ext of external) {
      const idExternoStr = String(ext.id);
      const countryId = countryByExt.get(String(ext.countryId));
      const programId = programByExt.get(String(ext.programId));

      // Sin país o programa local no se puede crear/actualizar (FK obligatorio).
      if (!countryId || !programId) {
        failed++;
        this.logger.warn(
          `Skipped option program id=${ext.id} "${ext.description}": country/program externo no existe localmente (countryId=${ext.countryId}, programId=${ext.programId}).`,
        );
        continue;
      }

      const name = ext.description.trim();
      const shortName = (name.split(/[\s(]/)[0] || name).slice(0, 50);
      const shortDatabase = String(ext.short_Database).trim().toUpperCase();
      const existing = byIdExterno.get(idExternoStr);

      try {
        if (existing) {
          // No se toca sponsorId ni status: el catálogo externo no los provee.
          await this.optionProgramRepository.update(existing.id, {
            name,
            shortName,
            shortDatabase,
            countryId,
            programId,
          });
          updated++;
        } else {
          const row = await this.optionProgramRepository.create({
            idExterno: idExternoStr,
            name,
            shortName,
            shortDatabase,
            countryId,
            programId,
            sponsorId: null,
            hideJobFair: false,
          });
          byIdExterno.set(idExternoStr, { id: row.id, idExterno: idExternoStr });
          created++;
        }
      } catch (err) {
        failed++;
        this.logger.error(
          `Failed to sync option program id=${ext.id} "${ext.description}": ${(err as Error).message}`,
        );
      }
    }

    return { created, updated, failed };
  }
}
