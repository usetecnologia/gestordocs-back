import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UploadFileDocumentDto {
  @ApiProperty({ example: 'uuid-del-user-document' })
  @IsUUID()
  userDocumentId!: string;

  @ApiProperty({ example: 'uui-del-user-creador'})
  @IsUUID()
  userCreatedId!: string;
}
