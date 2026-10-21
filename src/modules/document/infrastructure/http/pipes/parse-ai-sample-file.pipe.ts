import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { MulterFile } from '@modules/user-documents/domain/multer-file.interface';

export const AI_SAMPLE_MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

/** Solo presencia y tamaño: el tipo real se valida por bytes en el use case. */
@Injectable()
export class ParseAiSampleFilePipe implements PipeTransform<MulterFile | undefined, MulterFile> {
  transform(file?: MulterFile): MulterFile {
    if (!file) throw new BadRequestException('Sube un archivo para probar la extracción.');
    if (file.size > AI_SAMPLE_MAX_SIZE_BYTES) {
      throw new BadRequestException('El archivo no debe exceder 15 MB.');
    }
    return file;
  }
}
