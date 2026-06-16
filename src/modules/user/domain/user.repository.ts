import type { User } from './user.entity';
import type { UserStatus } from './user.enums';

export interface UserFilters {
  page: number;
  limit: number;
  status?: UserStatus;
  roleId?: string;
  countryId?: string;
  sponsorId?: string;
  programId?: string;
  optionProgramId?: string;
  search?: string;
}

export interface CreateUserData {
  firstname: string;
  middlename?: string;
  lastfathername: string;
  lastmothername?: string;
  birthdate?: string;
  phone?: string;
  username?: string;
  email?: string;
  password?: string;
  roleId: string;
  countryId?: string;
  sponsorId?: string;
  programId?: string;
  optionProgramId?: string;
  status?: UserStatus;
}

export interface UpdateUserData {
  firstname?: string;
  middlename?: string;
  lastfathername?: string;
  lastmothername?: string;
  birthdate?: string;
  phone?: string;
  avatar?: string;
  username?: string;
  email?: string;
  password?: string;
  roleId?: string;
  countryId?: string;
  sponsorId?: string;
  programId?: string;
  optionProgramId?: string;
  status?: UserStatus;
}

export interface IUserRepository {
  findAll(filters: UserFilters): Promise<{ data: User[]; total: number }>;
  findById(id: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  update(id: string, data: UpdateUserData): Promise<User>;
  delete(id: string): Promise<void>;
  addStatusHistory(userId: string, status: UserStatus): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
