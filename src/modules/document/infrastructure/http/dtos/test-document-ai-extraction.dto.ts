import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { DocumentAiProfile } from '../../../domain/document.enums';
import { AI_INSTRUCTIONS_MAX_LENGTH, emptyToUndefined } from './create-document.dto';

/** Campos de texto del multipart; el archivo llega aparte como `file`. */
export class TestDocumentAiExtractionDto {
  @ApiProperty({ enum: DocumentAiProfile, example: DocumentAiProfile.PASSPORT })
  @IsEnum(DocumentAiProfile)
  profile!: DocumentAiProfile;

  @ApiPropertyOptional({ description: 'Instrucciones adicionales a probar (las que estén en pantalla).' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(AI_INSTRUCTIONS_MAX_LENGTH)
  instructions?: string;
}
