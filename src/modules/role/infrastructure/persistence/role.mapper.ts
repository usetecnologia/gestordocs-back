import type { RoleModel } from 'prisma/generated/prisma/models';
import { Role } from '../../domain/role.entity';

export class RoleMapper {
  static toDomain(raw: RoleModel): Role {
    return new Role(
      raw.id,
      raw.name,
      raw.code ?? null,
      raw.description ?? null,
      raw.isSystem,
      raw.status,
      raw.createdAt,
      raw.updatedAt,
    );
  }
}
