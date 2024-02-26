import { ReplicationMode } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import {
  ActorId,
  CustomSetting,
  TenancyModelOptions,
  TenantId,
} from '../interfaces/tenant-options.interface';

export class RLSPostgresQueryRunner extends PostgresQueryRunner {
  tenantId: TenantId = null;
  actorId: ActorId = null;
  customSettings: CustomSetting;
  isTransactionCommand = false;

  constructor(
    driver: PostgresDriver,
    mode: ReplicationMode,
    tenancyModelOptions: TenancyModelOptions,
  ) {
    super(driver, mode);
    this.setOptions(tenancyModelOptions);
  }

  private setOptions(tenancyModelOptions: TenancyModelOptions) {
    this.tenantId = tenancyModelOptions.tenantId;
    this.actorId = tenancyModelOptions.actorId;
    this.customSettings = tenancyModelOptions.customSettings;
  }

  async query(
    queryString: string,
    params?: any[],
    useStructuredResult?: boolean,
  ): Promise<any> {
    if (!this.isTransactionCommand) {
      const queryString = this.constructSetQuery();
      await super.query(queryString);
    }

    let result: Promise<any>;
    let error: Error;

    try {
      result = await super.query(queryString, params, useStructuredResult);
    } catch (err) {
      error = err;
    }

    if (!this.isTransactionCommand && !(this.isTransactionActive && error)) {
      const queryString = this.constructResetQuery();
      await super.query(queryString);
    }

    if (error) throw error;
    else return result;
  }

  async startTransaction(isolationLevel?: IsolationLevel): Promise<void> {
    this.isTransactionCommand = true;
    await super.startTransaction(isolationLevel);
    this.isTransactionCommand = false;
  }

  async commitTransaction(): Promise<void> {
    this.isTransactionCommand = true;
    await super.commitTransaction();
    this.isTransactionCommand = false;
  }

  async rollbackTransaction(): Promise<void> {
    this.isTransactionCommand = true;
    await super.rollbackTransaction();
    this.isTransactionCommand = false;
  }

  private constructSetQuery() {
    let queryString = '';
    if (this.customSettings) {
      for (const [key, value] of Object.entries(this.customSettings)) {
        queryString += `set "rls.${key}" = '${value}'; `;
      }
    }
    // Handle tenantId & actorId distinctly for backwards compatibility
    if (this.tenantId) {
      queryString += `set "rls.tenant_id" = '${this.tenantId}'; `;
    }

    if (this.actorId) {
      queryString += `set "rls.actor_id" = '${this.actorId}'; `;
    }
    if (!queryString) {
      throw new Error(
        'Invalid TenancyModelOptions. Check your RLSConnection configuration.',
      );
    }

    // Remove trailing space on the query string.
    queryString = queryString.trim();

    return queryString;
  }

  private constructResetQuery() {
    let queryString = '';
    if (this.customSettings) {
      for (const [key] of Object.entries(this.customSettings)) {
        queryString += `reset rls.${key}; `;
      }
    }
    // Handle tenantId & actorId distinctly for backwards compatibility
    if (this.actorId) {
      queryString += `reset rls.actor_id; `;
    }

    if (this.tenantId) {
      queryString += `reset rls.tenant_id; `;
    }

    if (!queryString) {
      throw new Error(
        'Invalid TenancyModelOptions. Check your RLSConnection configuration.',
      );
    }

    // Remove trailing space on the query string.
    queryString = queryString.trim();

    return queryString;
  }
}
