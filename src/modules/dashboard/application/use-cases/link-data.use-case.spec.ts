import { LinkDataUseCase } from './link-data.use-case';
import type {
  ICountryRepository,
  CreateCountryData,
  UpdateCountryData,
} from '@modules/country/domain/country.repository';
import type {
  IProgramRepository,
  CreateProgramData,
  UpdateProgramData,
} from '@modules/program/domain/program.repository';
import type {
  ISponsorRepository,
  CreateSponsorData,
  UpdateSponsorData,
} from '@modules/sponsor/domain/sponsor.repository';
import { Country } from '@modules/country/domain/country.entity';
import { Program } from '@modules/program/domain/program.entity';
import { Sponsor } from '@modules/sponsor/domain/sponsor.entity';
import type {
  IWorkuseGenericPort,
  WorkuseGenericsResponse,
} from '../../domain/workuse-generic.port';

/**
 * In-memory fake that mimics MariaDB's default (case-insensitive) collation
 * on the `code` column, which is `@unique` for Country/Program/Sponsor.
 * This lets the tests observe the same unique-constraint crash Prisma would
 * throw in production, without touching a real database.
 */
class FakeUniqueCodeRepository<
  E extends { id: string; idExterno: string | null; code: string; name: string },
  C extends { idExterno?: string; code: string; name: string },
  U extends { idExterno?: string; code?: string; name?: string; status?: boolean },
> {
  rows: E[];
  createCalls: C[] = [];
  updateCalls: { id: string; data: U }[] = [];
  deleteCalls: string[] = [];
  private nextId = 1;

  constructor(
    initial: E[],
    private readonly build: (id: string, data: C) => E,
  ) {
    this.rows = initial;
  }

  async findAllForSync(): Promise<E[]> {
    return this.rows.map((r) => ({ ...r }));
  }

  async create(data: C): Promise<E> {
    this.createCalls.push(data);
    const clash = this.rows.find((r) => r.code.toUpperCase() === data.code.toUpperCase());
    if (clash) {
      throw new Error(
        `Unique constraint failed on the constraint: \`code\` (existing id ${clash.id}, code "${clash.code}" vs new "${data.code}")`,
      );
    }
    const row = this.build(`generated-${this.nextId++}`, data);
    this.rows.push(row);
    return row;
  }

  async update(id: string, data: U): Promise<E> {
    this.updateCalls.push({ id, data });
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Row ${id} not found`);
    this.rows[idx] = { ...this.rows[idx], ...data } as E;
    return this.rows[idx];
  }

  async delete(id: string): Promise<void> {
    this.deleteCalls.push(id);
    this.rows = this.rows.filter((r) => r.id !== id);
  }

  findAll = jest.fn(() => Promise.reject(new Error('not used by LinkDataUseCase')));
  findAllActive = jest.fn(() => Promise.reject(new Error('not used by LinkDataUseCase')));
  findById = jest.fn(() => Promise.reject(new Error('not used by LinkDataUseCase')));
  isCodeTaken = jest.fn(() => Promise.reject(new Error('not used by LinkDataUseCase')));
}

function makeCountryRepo(initial: Country[]) {
  return new FakeUniqueCodeRepository<Country, CreateCountryData, UpdateCountryData>(
    initial,
    (id, data) =>
      new Country(
        id,
        data.idExterno ?? null,
        data.code,
        data.name,
        data.currency ?? null,
        data.countryCode ?? null,
        true,
        new Date(),
        new Date(),
      ),
  );
}

function makeProgramRepo(initial: Program[]) {
  return new FakeUniqueCodeRepository<Program, CreateProgramData, UpdateProgramData>(
    initial,
    (id, data) => new Program(id, data.idExterno ?? null, data.code, data.name, true, new Date(), new Date()),
  );
}

function makeSponsorRepo(initial: Sponsor[]) {
  return new FakeUniqueCodeRepository<Sponsor, CreateSponsorData, UpdateSponsorData>(
    initial,
    (id, data) => new Sponsor(id, data.idExterno ?? null, data.code, data.name, true, new Date(), new Date()),
  );
}

function makeWorkusePort(response: WorkuseGenericsResponse): IWorkuseGenericPort {
  return { fetchGenerics: jest.fn().mockResolvedValue(response) };
}

function emptyResponse(overrides: Partial<WorkuseGenericsResponse> = {}): WorkuseGenericsResponse {
  return {
    countries: [],
    programs: [],
    optionPrograms: [],
    sponsor: [],
    ...overrides,
  };
}

describe('LinkDataUseCase', () => {
  it('never deletes any country, program or sponsor record', async () => {
    const countryRepo = makeCountryRepo([
      new Country('c1', '10', 'USA', 'United States', null, null, true, new Date(), new Date()),
    ]);
    const programRepo = makeProgramRepo([]);
    const sponsorRepo = makeSponsorRepo([]);
    const port = makeWorkusePort(
      emptyResponse({
        countries: [{ id: 10, code: 'USA', name: 'United States of America' }],
        programs: [{ id: 20, short: 'WAT', name: 'Work and Travel' }],
        sponsor: [{ id: 30, name: 'Acme Sponsor' }],
      }),
    );

    const useCase = new LinkDataUseCase(port, countryRepo as unknown as ICountryRepository, programRepo as unknown as IProgramRepository, sponsorRepo as unknown as ISponsorRepository);
    await useCase.execute();

    expect(countryRepo.deleteCalls).toHaveLength(0);
    expect(programRepo.deleteCalls).toHaveLength(0);
    expect(sponsorRepo.deleteCalls).toHaveLength(0);
  });

  it('updates an existing record matched by idExterno instead of duplicating it', async () => {
    const countryRepo = makeCountryRepo([
      new Country('c1', '10', 'USA', 'United States', null, null, true, new Date(), new Date()),
    ]);
    const port = makeWorkusePort(
      emptyResponse({ countries: [{ id: 10, code: 'USA', name: 'United States of America' }] }),
    );
    const useCase = new LinkDataUseCase(
      port,
      countryRepo as unknown as ICountryRepository,
      makeProgramRepo([]) as unknown as IProgramRepository,
      makeSponsorRepo([]) as unknown as ISponsorRepository,
    );

    const result = await useCase.execute();

    expect(result.countries).toEqual({ created: 0, updated: 1, failed: 0 });
    expect(countryRepo.createCalls).toHaveLength(0);
    expect(countryRepo.rows).toHaveLength(1);
    expect(countryRepo.rows[0].name).toBe('United States of America');
  });

  it('creates a brand-new record when nothing local matches', async () => {
    const countryRepo = makeCountryRepo([]);
    const port = makeWorkusePort(emptyResponse({ countries: [{ id: 99, code: 'PER', name: 'Peru' }] }));
    const useCase = new LinkDataUseCase(
      port,
      countryRepo as unknown as ICountryRepository,
      makeProgramRepo([]) as unknown as IProgramRepository,
      makeSponsorRepo([]) as unknown as ISponsorRepository,
    );

    const result = await useCase.execute();

    expect(result.countries).toEqual({ created: 1, updated: 0, failed: 0 });
    expect(countryRepo.rows).toHaveLength(1);
  });

  it('FIXED (bug 3): country matching is now case-insensitive, so a differently-cased existing code is recognized and linked instead of duplicated', async () => {
    // Pre-existing country created manually with lowercase code and no idExterno yet.
    const countryRepo = makeCountryRepo([
      new Country('c1', null, 'usa', 'United States', null, null, true, new Date(), new Date()),
    ]);
    const port = makeWorkusePort(emptyResponse({ countries: [{ id: 10, code: 'USA', name: 'United States' }] }));
    const useCase = new LinkDataUseCase(
      port,
      countryRepo as unknown as ICountryRepository,
      makeProgramRepo([]) as unknown as IProgramRepository,
      makeSponsorRepo([]) as unknown as ISponsorRepository,
    );

    const result = await useCase.execute();

    expect(result.countries).toEqual({ created: 0, updated: 1, failed: 0 });
    expect(countryRepo.createCalls).toHaveLength(0); // no duplicate attempted
    expect(countryRepo.rows).toHaveLength(1);
    expect(countryRepo.rows[0].id).toBe('c1'); // linked to the pre-existing row
    expect(countryRepo.rows[0].idExterno).toBe('10');
  });

  it('FIXED (bug 1): two items in the same Workuse payload sharing a code are linked to a single local record instead of crashing/duplicating', async () => {
    const programRepo = makeProgramRepo([]);
    const port = makeWorkusePort(
      emptyResponse({
        programs: [
          { id: 1, short: 'WAT', name: 'Work and Travel' },
          { id: 2, short: 'WAT', name: 'Work and Travel (duplicate entry from source)' },
        ],
      }),
    );
    const useCase = new LinkDataUseCase(
      port,
      makeCountryRepo([]) as unknown as ICountryRepository,
      programRepo as unknown as IProgramRepository,
      makeSponsorRepo([]) as unknown as ISponsorRepository,
    );

    const result = await useCase.execute();

    // The in-loop lookup maps are now refreshed after every create()/update(), so the
    // second item recognizes the row the first one just created in this same run.
    expect(result.programs).toEqual({ created: 1, updated: 1, failed: 0 });
    expect(programRepo.createCalls).toHaveLength(1);
    expect(programRepo.rows).toHaveLength(1); // only one row — no unique-constraint crash
    expect(programRepo.rows[0].idExterno).toBe('2'); // last item in the payload wins the link
  });

  it('FIXED (bug 2): a single record failing no longer aborts the rest of that entity nor the other entities (per-item error isolation)', async () => {
    const countryRepo = makeCountryRepo([]);
    const programRepo = makeProgramRepo([]);
    const sponsorRepo = makeSponsorRepo([]);
    const port = makeWorkusePort(
      emptyResponse({
        countries: [{ id: 1, code: 'PER', name: 'Peru' }],
        programs: [
          { id: 1, short: 'BROKEN', name: 'Simulated failure' },
          { id: 2, short: 'WAT', name: 'Work and Travel' },
        ],
        sponsor: [{ id: 1, name: 'Acme Sponsor' }],
      }),
    );

    // Simulate a genuine, unrelated failure (e.g. a transient DB error) on the first program only.
    jest.spyOn(programRepo, 'create').mockImplementationOnce(() => Promise.reject(new Error('simulated DB outage')));

    const useCase = new LinkDataUseCase(
      port,
      countryRepo as unknown as ICountryRepository,
      programRepo as unknown as IProgramRepository,
      sponsorRepo as unknown as ISponsorRepository,
    );

    const result = await useCase.execute(); // no longer throws

    expect(result.countries).toEqual({ created: 1, updated: 0, failed: 0 });
    expect(result.sponsors).toEqual({ created: 1, updated: 0, failed: 0 });
    expect(result.programs).toEqual({ created: 1, updated: 0, failed: 1 }); // BROKEN failed, WAT still created
    expect(countryRepo.rows).toHaveLength(1);
    expect(sponsorRepo.rows).toHaveLength(1);
    expect(programRepo.rows).toHaveLength(1);
    expect(programRepo.rows[0].code).toBe('WAT');
  });

  it('program update() overwrites a manually-curated `code`, unlike country/sponsor which preserve it', async () => {
    const programRepo = makeProgramRepo([
      new Program('p1', '20', 'CUSTOM-CODE-SET-BY-ADMIN', 'Work and Travel', true, new Date(), new Date()),
    ]);
    const port = makeWorkusePort(emptyResponse({ programs: [{ id: 20, short: 'WAT', name: 'Work and Travel' }] }));
    const useCase = new LinkDataUseCase(
      port,
      makeCountryRepo([]) as unknown as ICountryRepository,
      programRepo as unknown as IProgramRepository,
      makeSponsorRepo([]) as unknown as ISponsorRepository,
    );

    await useCase.execute();

    expect(programRepo.updateCalls[0].data.code).toBe('WAT');
    expect(programRepo.rows[0].code).toBe('WAT'); // admin's custom code silently lost
  });

  it('never touches `status`, so a manually-deactivated record is not silently reactivated', async () => {
    const sponsorRepo = makeSponsorRepo([
      new Sponsor('s1', '30', 'ACME SPONSOR', 'Acme Sponsor', false, new Date(), new Date()),
    ]);
    const port = makeWorkusePort(emptyResponse({ sponsor: [{ id: 30, name: 'Acme Sponsor' }] }));
    const useCase = new LinkDataUseCase(
      port,
      makeCountryRepo([]) as unknown as ICountryRepository,
      makeProgramRepo([]) as unknown as IProgramRepository,
      sponsorRepo as unknown as ISponsorRepository,
    );

    await useCase.execute();

    expect(sponsorRepo.updateCalls[0].data).not.toHaveProperty('status');
    expect(sponsorRepo.rows[0].status).toBe(false);
  });

  it('skips countries with a blank/whitespace code without crashing', async () => {
    const countryRepo = makeCountryRepo([]);
    const port = makeWorkusePort(
      emptyResponse({
        countries: [
          { id: 1, code: '   ', name: 'No code' },
          { id: 2, code: '', name: 'Also no code' },
          { id: 3, code: 'PER', name: 'Peru' },
        ],
      }),
    );
    const useCase = new LinkDataUseCase(
      port,
      countryRepo as unknown as ICountryRepository,
      makeProgramRepo([]) as unknown as IProgramRepository,
      makeSponsorRepo([]) as unknown as ISponsorRepository,
    );

    const result = await useCase.execute();

    expect(result.countries).toEqual({ created: 1, updated: 0, failed: 0 });
    expect(countryRepo.rows).toHaveLength(1);
  });

  it('BUG (not in scope of this fix): programs/sponsors have no equivalent blank-code guard — an empty `short` is created as-is', async () => {
    const programRepo = makeProgramRepo([]);
    const port = makeWorkusePort(emptyResponse({ programs: [{ id: 1, short: '', name: 'Untitled program' }] }));
    const useCase = new LinkDataUseCase(
      port,
      makeCountryRepo([]) as unknown as ICountryRepository,
      programRepo as unknown as IProgramRepository,
      makeSponsorRepo([]) as unknown as ISponsorRepository,
    );

    const result = await useCase.execute();

    expect(result.programs).toEqual({ created: 1, updated: 0, failed: 0 });
    expect(programRepo.rows[0].code).toBe(''); // a second blank-short program will collide on this empty code
  });
});
