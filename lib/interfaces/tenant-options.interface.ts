export type TenantId = string | number;
export type ActorId = string | number;
export type CustomSetting = {
  [key: string]: string | number;
};

export interface TenancyModelOptions {
  tenantId?: TenantId;
  actorId?: ActorId;
  customSettings?: CustomSetting;
}
