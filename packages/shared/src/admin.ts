export const MAX_COIN_BALANCE=1_000_000_000;
export interface AdminAccount {
  id:string;username:string;displayName:string;email:string;role:'admin'|'user';verified:boolean;
  owner:boolean;banned:boolean;balance:number;kickId:string|null;
  canModerate:boolean;canEditWallet:boolean;canChangeRole:boolean;
}
export interface AdminAudit {
  id:string;actorId:string;userId:string|null;actorName:string|null;targetName:string|null;
  action:string;reason:string;createdAt:string;revokedAt:string|null;
  canRevert:boolean;revertLabel:string;revertReason:string;
}
export interface AdminReport {id:string;reason:string;reporterName:string|null;targetName:string|null;createdAt:string}
export interface AdminOverview {
  users:AdminAccount[];total:number;offset:number;limit:number;canManageAdmins:boolean;
  logs:AdminAudit[];reports:AdminReport[];
}
