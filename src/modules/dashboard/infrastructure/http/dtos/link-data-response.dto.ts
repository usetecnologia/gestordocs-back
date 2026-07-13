import { ApiProperty } from '@nestjs/swagger';

export class SyncEntityResultDto {
  @ApiProperty({ example: 5, description: 'Records created during sync' }) created!: number;
  @ApiProperty({ example: 10, description: 'Records updated during sync' }) updated!: number;
  @ApiProperty({ example: 0, description: 'Records that failed to sync and were skipped (see server logs)' }) failed!: number;
}

export class SyncDataResponseDto {
  @ApiProperty({ type: SyncEntityResultDto }) countries!: SyncEntityResultDto;
  @ApiProperty({ type: SyncEntityResultDto }) programs!: SyncEntityResultDto;
  @ApiProperty({ type: SyncEntityResultDto }) sponsors!: SyncEntityResultDto;
}
