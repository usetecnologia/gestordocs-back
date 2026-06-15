import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { MulterFile } from '../../../domain/multer-file.interface';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class MaxFileSizePipe implements PipeTransform<MulterFile, MulterFile> {
  transform(file: MulterFile): MulterFile {
    if (!file) throw new BadRequestException('File is required');
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('File size must not exceed 10 MB');
    }
    return file;
  }
}
