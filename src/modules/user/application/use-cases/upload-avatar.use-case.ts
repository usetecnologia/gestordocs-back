import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';
import type { MulterFile } from '../../domain/multer-file.interface';
import type { User } from '../../domain/user.entity';

@Injectable()
export class UploadAvatarUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: IUserRepository,
    private readonly awsS3Service: AwsS3Service,
  ) {}

  async execute(userId: string, file: MulterFile): Promise<User> {
    const existing = await this.repo.findById(userId);
    if (!existing)
      throw new NotFoundException(`Usuario #${userId} no encontrado.`);

    const { url } = await this.awsS3Service.uploadOne(file, 'avatars');

    return this.repo.update(userId, { avatar: url });
  }
}
