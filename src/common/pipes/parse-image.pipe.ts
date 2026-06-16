import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class ParseImagePipe implements PipeTransform<ImageFile, ImageFile> {
  transform(file: ImageFile): ImageFile {
    if (!file) throw new BadRequestException('El archivo es requerido.');
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Formato de imagen no soportado. Usa jpeg, png, webp, gif o avif.',
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException(
        'El tamaño de la imagen no debe exceder 10 MB.',
      );
    }
    return file;
  }
}
