export interface IUserStatusPort {
  updateStatus(userId: string, status: string): Promise<void>;
}

export const USER_STATUS_PORT = Symbol('USER_STATUS_PORT');
