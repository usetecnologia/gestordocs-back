import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSponsorDto {
  @ApiProperty({ example: 'SP01' })
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  code!: string;

  @ApiProperty({ example: 'CIEE' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;
}
