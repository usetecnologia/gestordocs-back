import { ApiProperty } from '@nestjs/swagger';

export class BulkReviewDocumentErrorItemDto {
  @ApiProperty({ example: '12345678' })
  dni!: string;

  @ApiProperty({ example: 'El participante no tiene este documento asignado.' })
  reason!: string;
}

export class BulkReviewDocumentResponseDto {
  @ApiProperty({ example: 3 })
  totalSuccess!: number;

  @ApiProperty({ example: 1 })
  totalErrors!: number;

  @ApiProperty({ type: [String], example: ['12345678', '87654321'] })
  successes!: string[];

  @ApiProperty({ type: [BulkReviewDocumentErrorItemDto] })
  errors!: BulkReviewDocumentErrorItemDto[];
}
