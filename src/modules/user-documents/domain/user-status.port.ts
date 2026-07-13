export interface IUserStatusPort {
  getStatus(userId: string): Promise<string | null>;
  updateStatus(userId: string, status: string, createdById?: string): Promise<void>;
  getRole(userId: string): Promise<string | null>;
  hasActiveObservation(userId: string): Promise<boolean>;
  findLastStatusBeforeInactive(userId: string): Promise<string | null>;
}

export const USER_STATUS_PORT = Symbol('USER_STATUS_PORT');
