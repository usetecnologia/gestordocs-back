import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token emitido en el login' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
