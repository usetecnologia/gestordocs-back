import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { MulterFile } from '../../../domain/multer-file.interface';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class ParseOptionalPdfPipe implements PipeTransform<MulterFile | undefined, MulterFile | undefined> {
  transform(file?: MulterFile): MulterFile | undefined {
    if (!file) return undefined;
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('El archivo debe ser un PDF.');
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('El tamaño del archivo no debe exceder 10 MB.');
    }
    return file;
  }
}
