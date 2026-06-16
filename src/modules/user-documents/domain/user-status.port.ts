export interface IUserStatusPort {
  getStatus(userId: string): Promise<string | null>;
  updateStatus(userId: string, status: string): Promise<void>;
}

export const USER_STATUS_PORT = Symbol('USER_STATUS_PORT');
