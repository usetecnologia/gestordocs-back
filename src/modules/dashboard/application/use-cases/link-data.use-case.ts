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
    // Los option programs se consolidan por la combinación (programId, shortDatabase).
    // El catálogo externo trae una fila por (país, programa, shortDatabase); al colapsar
    // los países, varias filas externas caen en el mismo consolidado. La primera lo crea y
    // el resto se ignora (ya existe). Ya no se usa idExterno, name ni país/sponsor.
    const [programs, local] = await Promise.all([
      this.programRepository.findAllForSync(),
      this.optionProgramRepository.findAllForSync(),
    ]);

    // Mapa idExterno -> id local del programa (el shortDatabase se toma tal cual del catálogo).
    const programByExt = new Map(
      programs.filter((p) => p.idExterno?.trim()).map((p) => [p.idExterno!.trim(), p.id]),
    );
    // Clave consolidada (programId::shortDatabase) -> ya existe localmente.
    const key = (programId: string, shortDatabase: string) => `${programId}::${shortDatabase}`;
    const seen = new Set(local.map((o) => key(o.programId, o.shortDatabase)));

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const ext of external) {
      const programId = programByExt.get(String(ext.programId));

      // Sin programa local no se puede crear (FK obligatorio).
      if (!programId) {
        failed++;
        this.logger.warn(
          `Skipped option program id=${ext.id} "${ext.description}": program externo no existe localmente (programId=${ext.programId}).`,
        );
        continue;
      }

      const shortDatabase = String(ext.short_Database).trim().toUpperCase();
      const consolidatedKey = key(programId, shortDatabase);

      // Ya consolidado (por otra fila externa del mismo programa+shortDatabase, o ya en BD).
      if (seen.has(consolidatedKey)) {
        updated++;
        continue;
      }

      try {
        await this.optionProgramRepository.create({ shortDatabase, programId });
        seen.add(consolidatedKey);
        created++;
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
