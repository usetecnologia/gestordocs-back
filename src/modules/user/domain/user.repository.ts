import type { User } from './user.entity';
import type { UserStatus } from './user.enums';

export interface CreateObservationData {
  participantId: string;
  observation: string;
  createdById: string;
  etiquetaIds?: string[];
}

export interface ObservationResult {
  id: string;
  userId: string;
  observation: string;
  status: boolean;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
  createdBy: { id: string; fullName: string } | null;
  etiquetas: { id: string; name: string }[];
}

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
  findAllStaff(filters: UserFilters): Promise<{ data: User[]; total: number }>;
  findById(id: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  update(id: string, data: UpdateUserData): Promise<User>;
  delete(id: string): Promise<void>;
  addStatusHistory(userId: string, status: UserStatus, createdById?: string): Promise<void>;
  createObservation(data: CreateObservationData): Promise<ObservationResult>;
  closeObservation(observationId: string, createdById?: string): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
