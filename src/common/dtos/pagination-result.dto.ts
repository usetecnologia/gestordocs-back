import { ApiProperty } from '@nestjs/swagger';

export class PaginationResultDto<T> {
  @ApiProperty({ isArray: true })
  data!: T[];

  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  limit!: number;

  @ApiProperty({ example: 10 })
  totalPages!: number;
}

export function toPaginationResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginationResultDto<T> {
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}
