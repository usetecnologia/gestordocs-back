import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProgramDto {
  @ApiProperty({ example: 'WK' })
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  code!: string;

  @ApiProperty({ example: 'Work & Travel' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;
}
