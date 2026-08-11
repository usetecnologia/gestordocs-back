import { Inject, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { IUserRepository, USER_REPOSITORY, ExportUsersFilters, ExportUserRow } from '../../domain/user.repository';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '@modules/user-documents/domain/user-documents.repository';
import { IDocumentRepository, DOCUMENT_REPOSITORY } from '@modules/document/domain/document.repository';
import type { Document } from '@modules/document/domain/document.entity';

const NOT_ASSIGNED = 'NO ASIGNADO';

// Mismas etiquetas que el filtro de estado de /participant en el front, para que el Excel
// hable el idioma que el usuario ve en pantalla y no el valor crudo del enum.
const STATUS_LABELS: Record<string, string> = {
  SIN_DOCUMENTOS: 'Sin documentos',
  DOCUMENTOS_SUBIDOS: 'Documentos subidos',
  DOCUMENTOS_INCOMPLETOS: 'Docs. incompletos',
  PENDIENTE_REVISAR: 'Pendiente de revisar',
  EN_REVISION: 'En revisión',
  OBSERVADO: 'Observado',
  RETENIDO_USE: 'Retenido USE',
  PREPARACION: 'Docs. completos',
  ENVIADO_SPONSOR: 'Enviado al sponsor',
  OBSERVADO_SPONSOR: 'Observado por sponsor',
  RECHAZADO_SPONSOR: 'Rechazado por sponsor',
  APROBADO_SPONSOR: 'Aprobado por sponsor',
  DS2019_EMITIDO: 'DS2019 emitido',
  // Estados que no aparecen en el filtro — se toman las etiquetas de la tabla
  ACTIVO: 'Activo',
  INACTIVO: 'Retirado',
  RETIRADO: 'Retirado',
};

function toStatusLabel(status: string): string {
  if (!status) return '';
  return (
    STATUS_LABELS[status] ??
    status.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  );
}

const STATUS_STYLES: Record<string, { color: string; bold: boolean }> = {
  REVISADO: { color: 'FF38761D', bold: true },
  PENDIENTE: { color: 'FF999999', bold: true },
  OBSERVADO: { color: 'FFCC0000', bold: true },
  EN_REVISION: { color: 'FFB45F06', bold: true },
  SUBIDO: { color: 'FF1155CC', bold: true },
  [NOT_ASSIGNED]: { color: 'FF999999', bold: false },
};

@Injectable()
export class ExportParticipantsDocumentsUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(USER_DOCUMENTS_REPOSITORY) private readonly userDocumentsRepo: IUserDocumentsRepository,
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepo: IDocumentRepository,
  ) {}

  async execute(filters: ExportUsersFilters): Promise<Buffer> {
    const roleId = filters.roleId ?? (await this.userRepo.findDefaultRole()).id;

    const [users, documents] = await Promise.all([
      this.userRepo.findAllForExport({ ...filters, roleId }),
      this.documentRepo.findAllActive(),
    ]);

    const columns = documents.filter((d) => d.siglasCode);

    const docBySponsorId = new Map<string, Document>();
    const docById = new Map<string, Document>();
    for (const doc of columns) {
      docById.set(doc.id, doc);
      for (const sponsor of doc.sponsors) {
        docBySponsorId.set(sponsor.id, doc);
      }
    }

    const statusRows = await this.userDocumentsRepo.findActiveStatusesByUserIds(users.map((u) => u.id));

    const statusByUser = new Map<string, Map<string, string>>();
    for (const row of statusRows) {
      const doc = row.documentSponsorId
        ? docBySponsorId.get(row.documentSponsorId)
        : row.documentId
          ? docById.get(row.documentId)
          : undefined;
      if (!doc?.siglasCode) continue;

      if (!statusByUser.has(row.userId)) statusByUser.set(row.userId, new Map());
      statusByUser.get(row.userId)!.set(doc.siglasCode, row.status);
    }

    return this.buildWorkbook(users, columns, statusByUser);
  }

  private async buildWorkbook(
    users: ExportUserRow[],
    columns: Document[],
    statusByUser: Map<string, Map<string, string>>,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Document Status Report');

    const headerRow = sheet.addRow([
      'DNI',
      'LAST NAME',
      'NAMES',
      'HIRED',
      'SPONSOR',
      'STATUS PARTICIPANTE',
      ...columns.map((c) => c.siglasCode),
    ]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    });

    const FIRST_DOC_COLUMN = 7; // DNI, LAST NAME, NAMES, HIRED, SPONSOR, STATUS PARTICIPANTE, luego los docs

    for (const user of users) {
      const lastName = [user.lastfathername, user.lastmothername].filter(Boolean).join(' ');
      const names = [user.firstname, user.middlename].filter(Boolean).join(' ');
      const statuses = statusByUser.get(user.id);

      const row = sheet.addRow([
        user.dni ?? '',
        lastName,
        names,
        user.status_hired ?? '',
        user.sponsor ?? '',
        toStatusLabel(user.status),
        ...columns.map((c) => (c.siglasCode && statuses?.get(c.siglasCode)) || NOT_ASSIGNED),
      ]);

      row.getCell(1).font = { bold: true };
      row.getCell(2).font = { bold: true };
      row.getCell(3).font = { bold: true };

      columns.forEach((_, index) => {
        const cell = row.getCell(FIRST_DOC_COLUMN + index);
        const style = STATUS_STYLES[String(cell.value)];
        if (style) cell.font = { bold: style.bold, color: { argb: style.color } };
      });
    }

    sheet.columns.forEach((col) => {
      col.width = 16;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
