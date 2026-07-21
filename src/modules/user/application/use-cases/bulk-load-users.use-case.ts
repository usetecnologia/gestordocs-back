import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';
import { IPasswordHasher, PASSWORD_HASHER } from '../../domain/password-hasher.port';
import { WorkuseService } from '@shared/workuse/workuse.service';
import type { WorkuseParticipant } from '@shared/workuse/interfaces/workuse-participant.interface';

const DEFAULT_PASSWORD = 'password26';
const EMPTY_SPONSOR_VALUES = new Set(['', '&NBSP;', '_NBSP_']);
const TARGET_COUNTRY = 'PERU';
const TARGET_PROGRAM = 'WAT USA';

export interface BulkLoadResult {
  created: string[];
  existing: string[];
  errors: string[];
}

function normalizeSponsor(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  return EMPTY_SPONSOR_VALUES.has(trimmed) ? null : trimmed;
}

function resolveUserStatus(item: WorkuseParticipant): string {
  if (item.status?.trim().toLowerCase() === 'retired') return 'RETIRADO';
  if (item.fechadeenvioalsponsor) return 'ENVIADO_SPONSOR';
  return 'SIN_DOCUMENTOS';
}

@Injectable()
export class BulkLoadUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: IPasswordHasher,
    private readonly workuseService: WorkuseService,
  ) {}

  async execute(): Promise<BulkLoadResult> {
    const users = await this.workuseService.fetchParticipantsBulk();
    const role = await this.userRepo.findDefaultRole();
    const passwordHash = await this.passwordHasher.hash(DEFAULT_PASSWORD);

    const result: BulkLoadResult = { created: [], existing: [], errors: [] };

    for (const item of users) {
      if (!item.valid || !item.dni) {
        result.errors.push(item.dni ?? 'sin-dni');
        continue;
      }

      if (
        item.country.trim().toUpperCase() !== TARGET_COUNTRY ||
        item.program.trim().toUpperCase() !== TARGET_PROGRAM
      ) {
        continue;
      }

      try {
        const country = await this.userRepo.findCountryByName(item.country.trim().toUpperCase());
        if (!country) {
          result.errors.push(item.dni);
          continue;
        }

        const program = await this.userRepo.findOrCreateProgram(
          item.program.trim(),
          item.programId?.trim() || null,
        );
        const sponsorName = normalizeSponsor(item.sponsor);
        const sponsor = sponsorName
          ? await this.userRepo.findOrCreateSponsor(sponsorName, item.sponsorId?.trim() || null)
          : null;
        const optionProgram = await this.userRepo.findOrCreateOptionProgram(
          item.optionPrograma.trim(),
          country.id,
          program.id,
          sponsor?.id ?? null,
        );

        const commonData = {
          firstname: item.firstname,
          middlename: item.middlename || null,
          lastfathername: item.lastfathername,
          lastmothername: item.lastmothername || null,
          birthdate: item.birthdate || null,
          countryId: country.id,
          programId: program.id,
          sponsorId: sponsor?.id ?? null,
          optionProgramId: optionProgram.id,
          status: resolveUserStatus(item),
          employer: item.employer || null,
          email: item.email ?? null,
          status_hired: item.status_hired ?? null,
          hired_date: item.hired_date || null,
          jo_use_date: item.jo_use_date || null,
          programAgreementOK: item.programAgreementOK ?? null,
          fechadeenvioalsponsor: item.fechadeenvioalsponsor || null,
          fechaDSinUSE: item.fechaDSinUSE || null,
          statusSolRetiro: item.statusSolRetiro || null,
          statusExternal: item.status || null,
        };

        const exists = await this.userRepo.existsByDni(item.dni);
        if (exists) {
          await this.userRepo.updateByDni(item.dni, commonData);
          result.existing.push(item.dni);
        } else {
          await this.userRepo.createWithHistory({
            dni: item.dni,
            roleId: role.id,
            passwordHash,
            ...commonData,
          });
          result.created.push(item.dni);
        }
      } catch {
        result.errors.push(item.dni);
      }
    }

    return result;
  }
}
