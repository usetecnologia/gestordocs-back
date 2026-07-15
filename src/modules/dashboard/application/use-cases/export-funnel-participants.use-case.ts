import { Inject, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { IUserRepository, USER_REPOSITORY, FunnelExportRow } from '@modules/user/domain/user.repository';
import { UserStatus } from '@modules/user/domain/user.enums';
import { resolveDateRange } from '../../domain/resolve-date-range';
import type { DashboardFunnelExportQueryDto } from '../../infrastructure/http/dtos/dashboard-funnel-export-query.dto';

const HEADERS = ['DNI', 'Apellidos', 'Nombres', 'Programa', 'Pais', 'Sponsor', 'Email', 'Sol. Retiro', 'Estado'];

// Solo cambia la etiqueta mostrada en el Excel — el status real (INACTIVO) no cambia en ningún lado.
const STATUS_LABELS: Partial<Record<UserStatus, string>> = {
  [UserStatus.INACTIVO]: 'Retirado',
};

function statusLabel(status: UserStatus): string {
  return STATUS_LABELS[status] ?? status;
}

@Injectable()
export class ExportFunnelParticipantsUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository) {}

  async execute(query: DashboardFunnelExportQueryDto): Promise<Buffer> {
    const { from, to } = resolveDateRange(query.range, query.dateFrom, query.dateTo);

    const rows = await this.userRepository.findAllForFunnelExport({
      status: query.status,
      sponsorId: query.sponsorId,
      programId: query.programId,
      countryId: query.countryId,
      createdFrom: from,
      createdTo: to,
    });

    return this.buildWorkbook(rows);
  }

  private async buildWorkbook(rows: FunnelExportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Participantes');

    const headerRow = sheet.addRow(HEADERS);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    });

    for (const row of rows) {
      sheet.addRow([
        row.dni ?? '',
        row.lastname,
        row.firstname,
        row.program ?? '',
        row.country ?? '',
        row.sponsor ?? '',
        row.email ?? '',
        row.statusSolRetiro ?? '',
        statusLabel(row.status),
      ]);
    }

    sheet.columns.forEach((col) => {
      col.width = 20;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
