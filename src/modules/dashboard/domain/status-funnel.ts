import { UserStatus } from '@modules/user/domain/user.enums';

// Estados que se muestran en el funnel de participantes — se excluyen ACTIVO, RETIRADO
// e INACTIVO porque representan participantes que ya salieron del proceso de aplicación.
const EXCLUDED_FROM_FUNNEL: UserStatus[] = [UserStatus.ACTIVO, UserStatus.RETIRADO, UserStatus.INACTIVO];

export const FUNNEL_STATUSES: UserStatus[] = Object.values(UserStatus).filter(
  (status) => !EXCLUDED_FROM_FUNNEL.includes(status),
);
