/**
 * Catálogo de las tablas y columnas que las consultas en lenguaje natural pueden leer.
 *
 * Es la única fuente de verdad de la funcionalidad: alimenta el prompt del generador de SQL y
 * define la lista blanca que valida el SQL producido. Toda tabla o columna que no esté aquí es
 * invisible para la funcionalidad — por eso `User.password` no aparece y nunca podrá consultarse.
 *
 * Los nombres son los reales en MariaDB: los modelos de Prisma sin `@@map` conservan el nombre del
 * modelo (con mayúsculas), y las columnas sin `@map` conservan el nombre del campo.
 */

export interface CatalogColumn {
  readonly name: string;
  readonly type: string;
  readonly description?: string;
}

export interface CatalogTable {
  readonly name: string;
  readonly description: string;
  readonly columns: readonly CatalogColumn[];
}

const TIMESTAMPS_SNAKE: readonly CatalogColumn[] = [
  {
    name: 'created_at',
    type: 'datetime',
    description: 'Fecha de creación del registro',
  },
  {
    name: 'updated_at',
    type: 'datetime',
    description: 'Fecha de última actualización',
  },
];

const TIMESTAMPS_CAMEL: readonly CatalogColumn[] = [
  {
    name: 'createAt',
    type: 'datetime',
    description: 'Fecha de creación del registro',
  },
  {
    name: 'updateAt',
    type: 'datetime',
    description: 'Fecha de última actualización',
  },
];

export const USER_STATUS_VALUES = [
  'SIN_DOCUMENTOS',
  'DOCUMENTOS_SUBIDOS',
  'DOCUMENTOS_INCOMPLETOS',
  'PENDIENTE_REVISAR',
  'EN_REVISION',
  'OBSERVADO',
  'RETENIDO_USE',
  'PREPARACION',
  'ENVIADO_SPONSOR',
  'OBSERVADO_SPONSOR',
  'RECHAZADO_SPONSOR',
  'APROBADO_SPONSOR',
  'DS2019_EMITIDO',
  'RETIRADO',
  'ACTIVO',
  'INACTIVO',
] as const;

export const DOCUMENT_STATUS_VALUES = [
  'PENDIENTE',
  'SUBIDO',
  'EN_REVISION',
  'OBSERVADO',
  'REVISADO',
] as const;

export const DATABASE_CATALOG: readonly CatalogTable[] = [
  {
    name: 'User',
    description:
      'Usuarios del sistema. La gran mayoría son participantes (role_id apunta a Role.code = "PARTICIPANTE"); los administradores tienen Role.code = "ADMIN". Los datos personales (nombres, DNI, teléfono) NO están aquí sino en la tabla Person, que comparte el mismo id (Person.id = User.id).',
    columns: [
      { name: 'id', type: 'varchar(36)', description: 'UUID del usuario' },
      { name: 'username', type: 'varchar', description: 'Nombre de usuario' },
      { name: 'email', type: 'varchar', description: 'Correo electrónico' },
      { name: 'role_id', type: 'varchar(36)', description: 'FK → Role.id' },
      {
        name: 'countryId',
        type: 'varchar(36)',
        description: 'FK → Country.id',
      },
      {
        name: 'sponsorId',
        type: 'varchar(36)',
        description: 'FK → Sponsor.id',
      },
      {
        name: 'programId',
        type: 'varchar(36)',
        description: 'FK → Program.id',
      },
      {
        name: 'optionProgramId',
        type: 'varchar(36)',
        description: 'FK → OptionProgram.id',
      },
      { name: 'employer', type: 'varchar', description: 'Empleador asignado' },
      {
        name: 'status_hired',
        type: 'int',
        description: '1 = contratado, 0 o NULL = no contratado',
      },
      {
        name: 'hired_date',
        type: 'varchar',
        description: 'Fecha de contratación (texto)',
      },
      {
        name: 'jo_use_date',
        type: 'varchar',
        description: 'Fecha de Job Offer en USE (texto)',
      },
      {
        name: 'programAgreementOK',
        type: 'boolean',
        description: 'Aceptó el acuerdo del programa',
      },
      {
        name: 'fechadeenvioalsponsor',
        type: 'varchar',
        description: 'Fecha de envío al sponsor (texto)',
      },
      {
        name: 'fechaDSinUSE',
        type: 'varchar',
        description: 'Fecha del DS-2019 en USE (texto)',
      },
      {
        name: 'statusSolRetiro',
        type: 'varchar',
        description: 'Estado de la solicitud de retiro',
      },
      {
        name: 'statusExternal',
        type: 'varchar',
        description: 'Estado en el sistema externo',
      },
      {
        name: 'status',
        type: `enum(${USER_STATUS_VALUES.join(', ')})`,
        description: 'Estado del participante dentro del flujo documentario',
      },
      ...TIMESTAMPS_SNAKE,
    ],
  },
  {
    name: 'Person',
    description:
      'Datos personales. Se une con User por id: `JOIN Person p ON p.id = u.id`. No tiene columna userId.',
    columns: [
      {
        name: 'id',
        type: 'varchar(36)',
        description: 'Mismo UUID que User.id',
      },
      { name: 'firstname', type: 'varchar', description: 'Primer nombre' },
      { name: 'middlename', type: 'varchar', description: 'Segundo nombre' },
      {
        name: 'lastfathername',
        type: 'varchar',
        description: 'Apellido paterno',
      },
      {
        name: 'lastmothername',
        type: 'varchar',
        description: 'Apellido materno',
      },
      {
        name: 'birthdate',
        type: 'varchar',
        description: 'Fecha de nacimiento (texto)',
      },
      { name: 'phone', type: 'varchar(20)', description: 'Teléfono' },
      {
        name: 'avatar',
        type: 'varchar(500)',
        description: 'URL de la foto de perfil',
      },
      {
        name: 'dni',
        type: 'varchar(20)',
        description: 'Documento de identidad',
      },
      ...TIMESTAMPS_SNAKE,
    ],
  },
  {
    name: 'Role',
    description: 'Roles del sistema. Códigos conocidos: ADMIN y PARTICIPANTE.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      {
        name: 'name',
        type: 'varchar(100)',
        description: 'Nombre visible del rol',
      },
      {
        name: 'code',
        type: 'varchar(50)',
        description: 'Código único: ADMIN, PARTICIPANTE',
      },
      { name: 'description', type: 'text' },
      { name: 'is_system', type: 'boolean' },
      { name: 'status', type: 'boolean', description: '1 = activo' },
      ...TIMESTAMPS_SNAKE,
    ],
  },
  {
    name: 'Country',
    description: 'Países disponibles.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      { name: 'idExterno', type: 'varchar' },
      { name: 'code', type: 'varchar', description: 'Código único del país' },
      { name: 'name', type: 'varchar', description: 'Nombre del país' },
      { name: 'currency', type: 'varchar' },
      { name: 'countryCode', type: 'varchar' },
      { name: 'status', type: 'boolean', description: '1 = activo' },
      ...TIMESTAMPS_CAMEL,
    ],
  },
  {
    name: 'Program',
    description: 'Programas (Work & Travel, Internship, etc.).',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      { name: 'idExterno', type: 'varchar' },
      { name: 'code', type: 'varchar' },
      { name: 'name', type: 'varchar', description: 'Nombre del programa' },
      { name: 'status', type: 'boolean' },
      ...TIMESTAMPS_CAMEL,
    ],
  },
  {
    name: 'Sponsor',
    description: 'Sponsors (patrocinadores) de los participantes.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      { name: 'idExterno', type: 'varchar' },
      { name: 'code', type: 'varchar' },
      { name: 'name', type: 'varchar', description: 'Nombre del sponsor' },
      { name: 'status', type: 'boolean' },
      ...TIMESTAMPS_CAMEL,
    ],
  },
  {
    name: 'OptionProgram',
    description:
      'Combinación país + programa + sponsor a la que se inscribe un participante.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      { name: 'idExterno', type: 'varchar' },
      { name: 'name', type: 'varchar' },
      { name: 'shortName', type: 'varchar' },
      { name: 'shortDatabase', type: 'varchar' },
      {
        name: 'countryId',
        type: 'varchar(36)',
        description: 'FK → Country.id',
      },
      {
        name: 'programId',
        type: 'varchar(36)',
        description: 'FK → Program.id',
      },
      {
        name: 'sponsorId',
        type: 'varchar(36)',
        description: 'FK → Sponsor.id',
      },
      { name: 'status', type: 'boolean' },
      { name: 'hideJobFair', type: 'boolean' },
      ...TIMESTAMPS_CAMEL,
    ],
  },
  {
    name: 'documents',
    description:
      'Catálogo maestro de documentos que un participante debe presentar.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      {
        name: 'name',
        type: 'varchar(200)',
        description: 'Nombre del documento',
      },
      { name: 'type', type: 'enum(DOCUMENT, INFORMATIVE)' },
      {
        name: 'formats',
        type: 'varchar(500)',
        description: 'Formatos aceptados',
      },
      { name: 'show_hired', type: 'enum(HIRED, NOT_HIRED, ALL)' },
      { name: 'title', type: 'varchar' },
      {
        name: '`order`',
        type: 'int',
        description:
          'Orden de visualización — palabra reservada, usar siempre con backticks',
      },
      { name: 'siglasCode', type: 'varchar' },
      { name: 'instructions', type: 'text' },
      { name: 'required', type: 'boolean' },
      { name: 'status', type: 'boolean' },
      {
        name: 'created_by_id',
        type: 'varchar(36)',
        description: 'FK → User.id',
      },
      {
        name: 'updated_by_id',
        type: 'varchar(36)',
        description: 'FK → User.id',
      },
      ...TIMESTAMPS_SNAKE,
    ],
  },
  {
    name: 'document_sponsors',
    description: 'Documentos exigidos por un sponsor concreto.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      {
        name: 'document_id',
        type: 'varchar(36)',
        description: 'FK → documents.id',
      },
      {
        name: 'sponsor_id',
        type: 'varchar(36)',
        description: 'FK → Sponsor.id',
      },
      { name: 'required', type: 'boolean' },
      {
        name: '`order`',
        type: 'int',
        description: 'Palabra reservada, usar siempre con backticks',
      },
      { name: 'status', type: 'boolean' },
      { name: 'created_by_id', type: 'varchar(36)' },
      { name: 'updated_by_id', type: 'varchar(36)' },
      ...TIMESTAMPS_SNAKE,
    ],
  },
  {
    name: 'UserDocuments',
    description:
      'Vínculo entre un participante y un documento que debe entregar, con su estado actual. Solo las filas con status_document = 1 son las vigentes; las demás son histórico.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      { name: 'userId', type: 'varchar(36)', description: 'FK → User.id' },
      {
        name: 'documentId',
        type: 'varchar(36)',
        description: 'FK → documents.id (documento global)',
      },
      {
        name: 'documentSponsorId',
        type: 'varchar(36)',
        description: 'FK → document_sponsors.id',
      },
      {
        name: 'status',
        type: `enum(${DOCUMENT_STATUS_VALUES.join(', ')})`,
        description: 'Estado del documento del participante',
      },
      {
        name: 'status_document',
        type: 'boolean',
        description: '1 = registro vigente, 0 = histórico',
      },
      ...TIMESTAMPS_SNAKE,
    ],
  },
  {
    name: 'UserDocumentHistory',
    description:
      'Historial de cambios de un documento del participante (subidas, revisiones, observaciones).',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      {
        name: 'userDocumentsId',
        type: 'varchar(36)',
        description: 'FK → UserDocuments.id',
      },
      { name: 'status', type: `enum(${DOCUMENT_STATUS_VALUES.join(', ')})` },
      { name: 'url', type: 'text', description: 'URL del archivo subido' },
      {
        name: 'observation',
        type: 'text',
        description: 'Observación registrada',
      },
      {
        name: 'created_by_id',
        type: 'varchar(36)',
        description: 'FK → User.id (quién lo registró)',
      },
      ...TIMESTAMPS_SNAKE,
    ],
  },
  {
    name: 'UserDocumentObservationFiles',
    description: 'Archivos adjuntos a una observación de documento.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      {
        name: 'userDocumentHistoryId',
        type: 'varchar(36)',
        description: 'FK → UserDocumentHistory.id',
      },
      { name: 'file', type: 'text' },
      { name: 'created_at', type: 'datetime' },
    ],
  },
  {
    name: 'UserDocumentHistoryEtiquetas',
    description:
      'Etiquetas asociadas a un movimiento del historial de documentos.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      {
        name: 'userDocumentHistoryId',
        type: 'varchar(36)',
        description: 'FK → UserDocumentHistory.id',
      },
      {
        name: 'etiquetaId',
        type: 'varchar(36)',
        description: 'FK → Etiquetas.id',
      },
      { name: 'created_at', type: 'datetime' },
    ],
  },
  {
    name: 'UserObservations',
    description:
      'Observaciones sobre un participante. Una observación está ACTIVA cuando status = 1 y endDate IS NULL.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      { name: 'userId', type: 'varchar(36)', description: 'FK → User.id' },
      { name: 'observation', type: 'text' },
      { name: 'status', type: 'boolean', description: '1 = abierta' },
      {
        name: 'endDate',
        type: 'datetime',
        description: 'NULL mientras siga abierta',
      },
      {
        name: 'created_by_id',
        type: 'varchar(36)',
        description: 'FK → User.id (quién la creó)',
      },
      ...TIMESTAMPS_SNAKE,
    ],
  },
  {
    name: 'UserObservationFiles',
    description: 'Archivos adjuntos a una observación del participante.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      {
        name: 'userObservationId',
        type: 'varchar(36)',
        description: 'FK → UserObservations.id',
      },
      { name: 'file', type: 'text' },
      { name: 'created_at', type: 'datetime' },
    ],
  },
  {
    name: 'UserObservationEtiquetas',
    description: 'Etiquetas asociadas a una observación del participante.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      {
        name: 'userObservationId',
        type: 'varchar(36)',
        description: 'FK → UserObservations.id',
      },
      {
        name: 'etiquetaId',
        type: 'varchar(36)',
        description: 'FK → Etiquetas.id',
      },
    ],
  },
  {
    name: 'UserHistoryStatus',
    description:
      'Historial de cambios de estado del participante. Útil para medir tiempos entre estados.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      { name: 'userId', type: 'varchar(36)', description: 'FK → User.id' },
      { name: 'status', type: `enum(${USER_STATUS_VALUES.join(', ')})` },
      { name: 'created_by_id', type: 'varchar(36)' },
      ...TIMESTAMPS_SNAKE,
    ],
  },
  {
    name: 'Etiquetas',
    description: 'Etiquetas reutilizables para clasificar observaciones.',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      { name: 'name', type: 'varchar' },
      { name: 'status', type: 'boolean' },
      { name: 'created_by_id', type: 'varchar(36)' },
      { name: 'updated_by_id', type: 'varchar(36)' },
      ...TIMESTAMPS_SNAKE,
    ],
  },
  {
    name: 'acciones_correo',
    description:
      'Acciones del sistema que disparan un correo (modelo EmailAction).',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      { name: 'name', type: 'varchar(200)' },
      {
        name: 'code',
        type: 'varchar(50)',
        description: 'Ej.: DOCUMENTO_OBSERVADO, USER_OBSERVADO',
      },
      { name: 'status', type: 'boolean' },
      ...TIMESTAMPS_SNAKE,
    ],
  },
  {
    name: 'plantillas_correo',
    description: 'Plantillas de correo (modelo EmailTemplate).',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      { name: 'name', type: 'varchar(100)' },
      { name: 'code', type: 'varchar(50)' },
      { name: 'subject', type: 'varchar(150)' },
      { name: 'status', type: 'boolean' },
      { name: 'type', type: 'enum(NORMAL, PROGRAMADA)' },
      {
        name: 'action_id',
        type: 'varchar(36)',
        description: 'FK → acciones_correo.id',
      },
      { name: 'created_by_id', type: 'varchar(36)' },
      { name: 'updated_by_id', type: 'varchar(36)' },
      ...TIMESTAMPS_SNAKE,
    ],
  },
  {
    name: 'historial_correos',
    description:
      'Historial de todo intento de envío de correo (modelo EmailLog).',
    columns: [
      { name: 'id', type: 'varchar(36)' },
      { name: 'action_id', type: 'varchar(36)' },
      { name: 'action_code', type: 'varchar(50)' },
      { name: 'template_id', type: 'varchar(36)' },
      { name: 'template_code', type: 'varchar(50)' },
      {
        name: 'recipient_user_id',
        type: 'varchar(36)',
        description: 'FK → User.id',
      },
      { name: 'recipient_email', type: 'varchar(150)' },
      { name: 'subject', type: 'varchar(200)' },
      { name: 'status', type: 'enum(ENVIADO, FALLIDO, OMITIDO)' },
      { name: 'source', type: 'enum(NORMAL, PROGRAMADA)' },
      { name: 'error_message', type: 'text' },
      { name: 'sent_at', type: 'datetime', description: 'Fecha del envío' },
    ],
  },
];

/** Lista blanca de tablas consultables, en minúsculas para comparar sin importar el case. */
export const ALLOWED_TABLES: ReadonlySet<string> = new Set(
  DATABASE_CATALOG.map((table) => table.name.toLowerCase()),
);

/** Representación textual del catálogo que se inyecta en el prompt del modelo. */
export function buildSchemaDescription(): string {
  return DATABASE_CATALOG.map((table) => {
    const columns = table.columns
      .map((column) => {
        const comment = column.description ? ` -- ${column.description}` : '';
        return `  ${column.name}: ${column.type}${comment}`;
      })
      .join('\n');
    return `TABLA \`${table.name}\` — ${table.description}\n${columns}`;
  }).join('\n\n');
}
