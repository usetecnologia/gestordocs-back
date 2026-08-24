import { UserMapper, type PrismaUserList } from './user.mapper';

/**
 * El historial de correos pertenece a un ciclo, no a la persona. Un participante al que le cerraron
 * el ciclo y volvió a ingresar arranca **sin historial**: los correos del ciclo anterior siguen
 * existiendo colgados de su proceso, pero no se le muestran.
 *
 * El filtro vive en el mapeo y no en el `include` porque Prisma no puede comparar un include contra
 * una columna de la fila padre. Este test es lo que impide que ese filtro se pierda en una
 * refactorización del mapper.
 */

const CORREO_BASE = {
  actionCode: 'DOCUMENTO_OBSERVADO',
  templateCode: 'obs-1',
  subject: 'Tu documento fue observado',
  status: 'ENVIADO',
  source: 'AUTOMATICA',
  errorMessage: null,
  sentAt: new Date('2026-07-01'),
};

function usuarioCon(
  procesoVisibleId: string | null,
  correos: Array<{ id: string; procesoId: string | null }>,
): PrismaUserList {
  return {
    id: 'u1',
    username: 'u1',
    email: 'u1@test.com',
    roleId: 'r1',
    countryId: null,
    sponsorId: null,
    programId: null,
    optionProgramId: null,
    status: 'SIN_DOCUMENTOS',
    statusSolRetiro: null,
    fechadeenvioalsponsor: null,
    procesoVisibleId,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    role: { id: 'r1', name: 'Participante', code: 'PARTICIPANTE' },
    country: null,
    sponsor: null,
    program: null,
    optionProgram: null,
    userHistories: [],
    userObservations: [],
    emailLogs: correos.map((c) => ({ ...CORREO_BASE, ...c })),
  } as unknown as PrismaUserList;
}

/** Usuario con historial de estados y observaciones repartidos entre ciclos. */
function usuarioConCiclos(
  procesoVisibleId: string | null,
  historial: Array<{ status: string; procesoId: string | null }>,
  observaciones: Array<{ id: string; procesoId: string | null }>,
) {
  return {
    ...usuarioCon(procesoVisibleId, []),
    userHistories: historial.map((h, i) => ({
      id: `h${i}`,
      status: h.status,
      procesoId: h.procesoId,
      createdById: null,
      createdAt: new Date('2026-07-01'),
    })),
    userObservations: observaciones.map((o) => ({
      id: o.id,
      procesoId: o.procesoId,
      observation: 'obs',
      status: true,
      endDate: null,
      createdAt: new Date('2026-07-01'),
      createdById: null,
      userObservationEtiquetas: [],
      userObservationFiles: [],
    })),
  } as unknown as Parameters<typeof UserMapper.toDetailDomain>[0];
}

describe('UserMapper — el historial de correos se acota al ciclo visible', () => {
  it('deja solo los correos del proceso visible', () => {
    const user = usuarioCon('p-nuevo', [
      { id: 'mail-viejo-1', procesoId: 'p-viejo' },
      { id: 'mail-nuevo', procesoId: 'p-nuevo' },
      { id: 'mail-viejo-2', procesoId: 'p-viejo' },
    ]);

    const domain = UserMapper.toListDomain(user, null);

    expect(domain.emailHistory?.map((m) => m.id)).toEqual(['mail-nuevo']);
  });

  it('un ciclo recién abierto queda sin historial', () => {
    // Es el caso que se reportó: se finalizó el ciclo, el participante volvió a ingresar y seguía
    // viendo los correos del ciclo anterior.
    const user = usuarioCon('p-nuevo', [
      { id: 'mail-viejo-1', procesoId: 'p-viejo' },
      { id: 'mail-viejo-2', procesoId: 'p-viejo' },
    ]);

    const domain = UserMapper.toListDomain(user, null);

    expect(domain.emailHistory).toEqual([]);
  });

  it('descarta los correos sin proceso, que no pertenecen a ningún ciclo', () => {
    // Los registros a nivel de plantilla (un OMITIDO sin audiencia) no tienen destinatario ni ciclo.
    const user = usuarioCon('p-nuevo', [
      { id: 'mail-sin-proceso', procesoId: null },
      { id: 'mail-nuevo', procesoId: 'p-nuevo' },
    ]);

    const domain = UserMapper.toListDomain(user, null);

    expect(domain.emailHistory?.map((m) => m.id)).toEqual(['mail-nuevo']);
  });

  it('sin proceso visible no muestra historial, en vez de mostrarlo todo', () => {
    const user = usuarioCon(null, [
      { id: 'mail-1', procesoId: 'p-viejo' },
      { id: 'mail-2', procesoId: null },
    ]);

    const domain = UserMapper.toListDomain(user, null);

    expect(domain.emailHistory).toEqual([]);
  });
});

/**
 * Cuando un ciclo se cierra y se abre el siguiente, el participante **empieza limpio**: documentos,
 * historial de estados, observaciones y correos. Nada se borra — todo sigue colgado de su ciclo—,
 * pero deja de mostrarse en un ciclo que no es el suyo.
 *
 * Estos tests cubren las dos mitades que se leen desde el mapper. Los documentos se acotan en el
 * repositorio de user-documents y tienen sus propios tests.
 */
describe('UserMapper — el historial de estados y las observaciones se acotan al ciclo visible', () => {
  it('deja solo los estados del ciclo visible', () => {
    const user = usuarioConCiclos(
      'p-nuevo',
      [
        { status: 'SIN_DOCUMENTOS', procesoId: 'p-nuevo' },
        { status: 'APROBADO_SPONSOR', procesoId: 'p-viejo' },
        { status: 'OBSERVADO', procesoId: 'p-viejo' },
      ],
      [],
    );

    const domain = UserMapper.toDetailDomain(user, null);

    expect(domain.historyStatus?.map((h) => h.status)).toEqual(['SIN_DOCUMENTOS']);
  });

  it('deja solo las observaciones del ciclo visible', () => {
    // Es el caso que se pidió: se cierra el ciclo con observaciones abiertas y el siguiente nace sin
    // ellas. Las observaciones no se cierran ni se borran: quedan en el ciclo donde se levantaron.
    const user = usuarioConCiclos('p-nuevo', [], [
      { id: 'obs-vieja-1', procesoId: 'p-viejo' },
      { id: 'obs-vieja-2', procesoId: 'p-viejo' },
    ]);

    const domain = UserMapper.toDetailDomain(user, null);

    expect(domain.observations).toEqual([]);
  });

  it('un ciclo recién abierto muestra solo su propia entrada de estado', () => {
    const user = usuarioConCiclos(
      'p-nuevo',
      [
        { status: 'SIN_DOCUMENTOS', procesoId: 'p-nuevo' },
        { status: 'DOCUMENTOS_INCOMPLETOS', procesoId: 'p-viejo' },
      ],
      [{ id: 'obs-nueva', procesoId: 'p-nuevo' }],
    );

    const domain = UserMapper.toDetailDomain(user, null);

    expect(domain.historyStatus).toHaveLength(1);
    expect(domain.observations?.map((o) => o.id)).toEqual(['obs-nueva']);
  });
});

/**
 * El constructor de `User` tiene 29 argumentos posicionales, y `proceso` es el último. Ya se
 * desalineó dos veces: una al insertar el campo en medio, y otra porque `toDetailDomain` se quedó sin
 * pasarlo y el chip del detalle mostraba "—" en vez del estado del ciclo.
 *
 * Estos tests son el seguro: si alguno de los dos mapeos deja de pasar el ciclo, o lo pasa en la
 * posición equivocada, fallan acá y no en la pantalla.
 */
describe('UserMapper — el ciclo llega al último argumento del constructor', () => {
  const CICLO = {
    id: 'p-nuevo',
    estado: 'FINALIZADO',
    statusDocumental: 'OBSERVADO_SPONSOR',
    fechaIngreso: new Date('2026-06-16'),
    finalizadoAt: new Date('2026-08-24'),
    esVisible: true,
  }

  it('toListDomain expone el ciclo de la fila, sin pisar observaciones ni historial', () => {
    const user = usuarioConCiclos(
      'p-nuevo',
      [{ status: 'SIN_DOCUMENTOS', procesoId: 'p-nuevo' }],
      [{ id: 'obs-1', procesoId: 'p-nuevo' }],
    );

    const domain = UserMapper.toListDomain(user, null, new Map(), CICLO);

    expect(domain.proceso).toEqual(CICLO);
    // El listado no trae observaciones: si aparecieran acá, algo se corrió de posición.
    expect(domain.observations).toBeNull();
    expect(domain.historyStatus?.map((h) => h.status)).toEqual(['SIN_DOCUMENTOS']);
  });

  it('toDetailDomain expone el ciclo mirado', () => {
    const user = usuarioConCiclos(
      'p-nuevo',
      [{ status: 'SIN_DOCUMENTOS', procesoId: 'p-nuevo' }],
      [{ id: 'obs-1', procesoId: 'p-nuevo' }],
    );

    const domain = UserMapper.toDetailDomain(user, null, new Map(), CICLO);

    expect(domain.proceso).toEqual(CICLO);
    expect(domain.observations?.map((o) => o.id)).toEqual(['obs-1']);
    expect(domain.historyStatus?.map((h) => h.status)).toEqual(['SIN_DOCUMENTOS']);
  });

  it('sin ciclo explícito el detalle no inventa uno', () => {
    const user = usuarioConCiclos('p-nuevo', [], []);

    const domain = UserMapper.toDetailDomain(user, null);

    expect(domain.proceso).toBeNull();
  });
});
