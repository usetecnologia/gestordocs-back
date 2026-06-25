import type { Role } from './role.entity';

export interface RoleFilters {
  page: number;
  limit: number;
  status?: boolean;
  search?: string;
}

export interface CreateRoleData {
  name: string;
  code?: string;
  description?: string;
  isSystem?: boolean;
}

export interface UpdateRoleData {
  name?: string;
  code?: string;
  description?: string;
  status?: boolean;
  isSystem?: boolean;
}

export interface IRoleRepository {
  findAll(filters: RoleFilters): Promise<{ data: Role[]; total: number }>;
  findAllActive(): Promise<Role[]>;
  findById(id: string): Promise<Role | null>;
  isCodeTaken(code: string, excludeId?: string): Promise<boolean>;
  create(data: CreateRoleData): Promise<Role>;
  update(id: string, data: UpdateRoleData): Promise<Role>;
  delete(id: string): Promise<void>;
}

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');
