import { SponsorPackage } from './sponsor-package.entity';
import {
  PackageOnMissing,
  PackageOutputMode,
  PackageStampAnchor,
  PackageStructure,
} from './sponsor-package.enums';

export interface SponsorPackageFilters {
  page: number;
  limit: number;
  search?: string;
  sponsorId?: string;
  programId?: string;
  countryId?: string;
  status?: boolean;
  structure?: PackageStructure;
}

/** Fila del listado. No trae el árbol: para eso está `findById`. */
export interface SponsorPackageListItem {
  id: string;
  name: string;
  sponsorId: string;
  sponsorCode: string;
  sponsorName: string;
  programId: string | null;
  programName: string | null;
  countryId: string | null;
  countryName: string | null;
  structure: PackageStructure;
  outputCount: number;
  inputCount: number;
  priority: number;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Una fuente en el modelo de escritura. Referencia al insumo **por slug** y no por id: en un
 * guardado "replace-all" los insumos se recrean, así que sus ids no existen todavía cuando el
 * cliente arma el payload.
 */
export interface UpsertSourceData {
  documentId?: string | null;
  inputSlug?: string | null;
  order: number;
  onMissing: PackageOnMissing;
}

export interface UpsertStampData {
  assetUrl: string;
  onlyDocumentId?: string | null;
  widthPt: number;
  marginXPt: number;
  marginYPt: number;
  anchor: PackageStampAnchor;
}

export interface UpsertOutputData {
  filename: string;
  mode: PackageOutputMode;
  order: number;
  emitWhenEmpty: boolean;
  sources: UpsertSourceData[];
  stamps: UpsertStampData[];
}

export interface UpsertInputData {
  slug: string;
  label: string;
  required: boolean;
  mimeType: string;
  maxSizeMb: number;
  archiveToS3: boolean;
  s3Folder?: string | null;
  archiveFilename?: string | null;
}

export interface CreateSponsorPackageData {
  name: string;
  sponsorId: string;
  programId: string | null;
  countryId: string | null;
  structure: PackageStructure;
  folderPathTemplate: string;
  itemNameTemplate: string;
  fallbackPrograma: string;
  fallbackPais: string;
  priority: number;
  outputs: UpsertOutputData[];
  inputs: UpsertInputData[];
  createdById: string | null;
}

export type UpdateSponsorPackageData = Omit<CreateSponsorPackageData, 'createdById'> & {
  status: boolean;
  updatedById: string | null;
};

/** Referencias a validar antes de escribir. Se chequean todas de una para no hacer N consultas. */
export interface ReferenceCheck {
  sponsorId: string;
  programId: string | null;
  countryId: string | null;
  documentIds: string[];
}

export interface ReferenceCheckResult {
  sponsorExists: boolean;
  programExists: boolean;
  countryExists: boolean;
  /** Ids que no existen o están inactivos. */
  missingDocumentIds: string[];
}

export interface ISponsorPackageRepository {
  /**
   * Todos los paquetes activos de un sponsor, con su árbol completo. El filtrado por programa y
   * país NO se hace acá: se trae el puñado de candidatos y `resolveSponsorPackage` elige, así la
   * regla de especificidad vive en el dominio y se testea sin base de datos.
   */
  findActiveBySponsorCode(sponsorCode: string): Promise<SponsorPackage[]>;

  /** Igual que el anterior pero para varios sponsors de una sola consulta — lo usa la descarga masiva. */
  findActiveBySponsorCodes(sponsorCodes: readonly string[]): Promise<SponsorPackage[]>;

  findAll(filters: SponsorPackageFilters): Promise<{ data: SponsorPackageListItem[]; total: number }>;

  /** El árbol completo, activo o no. El admin necesita poder abrir uno desactivado. */
  findById(id: string): Promise<SponsorPackage | null>;

  /**
   * Otro paquete **activo** con el mismo alcance exacto. Existe porque el `@@unique` no alcanza:
   * MariaDB considera cada NULL distinto, así que dos paquetes `(UNITED, NULL, NULL)` no chocan.
   */
  findScopeConflict(
    sponsorId: string,
    programId: string | null,
    countryId: string | null,
    excludeId?: string,
  ): Promise<{ id: string; name: string } | null>;

  checkReferences(refs: ReferenceCheck): Promise<ReferenceCheckResult>;

  create(data: CreateSponsorPackageData): Promise<string>;
  update(id: string, data: UpdateSponsorPackageData): Promise<void>;
  /** Borrado lógico: `status = false`. Nunca DELETE físico. */
  softDelete(id: string, updatedById: string | null): Promise<void>;
  updateOutputsOrder(id: string, orders: readonly { outputId: string; order: number }[]): Promise<void>;
}

export const SPONSOR_PACKAGE_REPOSITORY = Symbol('SPONSOR_PACKAGE_REPOSITORY');
