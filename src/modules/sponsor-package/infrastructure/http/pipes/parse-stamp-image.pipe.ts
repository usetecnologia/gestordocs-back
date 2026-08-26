import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { MulterFile } from '@modules/user-documents/domain/multer-file.interface';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Valida la imagen de un sello. Solo PNG, y no por capricho: `pdf-lib` embebe PNG y JPEG, pero el
 * sello se estampa **encima** de una página ya dibujada y necesita transparencia. Un JPEG taparía
 * el texto con un rectángulo blanco.
 *
 * Se verifica la firma de bytes además del mimetype, por la misma razón que el resto del proyecto:
 * el mimetype lo declara el cliente y puede no corresponder al contenido real.
 */
@Injectable()
export class ParseStampImagePipe implements PipeTransform<MulterFile | undefined, MulterFile> {
  transform(file?: MulterFile): MulterFile {
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');

    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('El sello no debe exceder 5 MB.');
    }

    const bytes = file.buffer;
    const esPng =
      bytes.length >= 4 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;

    if (!esPng) {
      throw new BadRequestException(
        'El sello debe ser un PNG. Se estampa sobre el documento, así que necesita fondo transparente.',
      );
    }

    return file;
  }
}
