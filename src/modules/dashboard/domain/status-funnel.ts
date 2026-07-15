import { UserStatus } from '@modules/user/domain/user.enums';

// Estados que se muestran en el funnel de participantes — se excluyen ACTIVO y RETIRADO
// porque representan participantes que ya salieron del proceso de aplicación.
export const FUNNEL_STATUSES: UserStatus[] = Object.values(UserStatus).filter(
  (status) => status !== UserStatus.ACTIVO && status !== UserStatus.RETIRADO,
);
