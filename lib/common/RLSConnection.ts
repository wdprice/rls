import { EntityMetadata, ReplicationMode, DataSource } from 'typeorm';
import { RLSPostgresDriver } from '../common/RLSPostgresDriver';
import {
  ActorId,
  CustomSetting,
  TenancyModelOptions,
  TenantId,
} from '../interfaces/tenant-options.interface';
import { RLSPostgresQueryRunner } from './RLSPostgresQueryRunner';

export class RLSConnection extends DataSource {
  readonly driver: RLSPostgresDriver;

  tenantId: TenantId = null;
  actorId: ActorId = null;
  customSettings: CustomSetting = null;

  constructor(
    dataSource: DataSource,
    tenancyModelOptions: TenancyModelOptions,
  ) {
    super(dataSource.options);
    Object.assign(this, dataSource);
    Object.assign(this.relationLoader, { connection: this });

    this.tenantId = tenancyModelOptions.tenantId;
    this.actorId = tenancyModelOptions.actorId;

    const metadatas: EntityMetadata[] = [];

    this.entityMetadatas.forEach(em => {
      // copy metadata and overwrite connection to this
      const wrappedMetadata: EntityMetadata = Object.assign(
        Object.create(Object.getPrototypeOf(em)),
        em,
        { connection: this },
      );

      // copy relations and overwrite the connection to this
      const metadataRelations = [];
      wrappedMetadata.relations.forEach(relation => {
        const wrappedRelation = Object.assign(
          Object.create(Object.getPrototypeOf(relation)),
          relation,
        );

        Object.assign(wrappedRelation.entityMetadata, { connection: this });
        metadataRelations.push(wrappedRelation);
      });

      Object.assign(wrappedMetadata, { relations: metadataRelations });
      metadatas.push(wrappedMetadata);
    });

    /**
     * for each metadata we need to go through the relationsWithJoinColumns
     * create a copy of it and find the inverseEntityMetadata that it
     * references and assign our own copy to it. This will help the ===
     * check on the topological sort, allowing for `save` and `delete`
     * operations
     */
    for (const metadata of metadatas) {
      const relationsWithJoinColumns = [];
      metadata.relationsWithJoinColumns.forEach(rwjc => {
        const relationWithJoinColumn = Object.assign(
          Object.create(Object.getPrototypeOf(rwjc)),
          rwjc,
        );

        const inverseEntityMetadata = metadatas.find(
          m => m.name === relationWithJoinColumn.inverseEntityMetadata.name,
        );

        relationWithJoinColumn.inverseEntityMetadata = inverseEntityMetadata;
        relationsWithJoinColumns.push(relationWithJoinColumn);
      });

      Object.assign(metadata, {
        relationsWithJoinColumns,
      });
    }

    Object.assign(this, { entityMetadatas: metadatas });

    const driver = new RLSPostgresDriver(this, tenancyModelOptions);

    Object.assign(driver, { connection: this });
    Object.assign(this, { driver });

    const manager = this.createEntityManager();
    Object.assign(this, { manager });
  }

  createQueryRunner(mode: ReplicationMode = 'master'): RLSPostgresQueryRunner {
    const queryRunner = this.driver.createQueryRunner(mode);
    const manager = this.createEntityManager(queryRunner);
    Object.assign(queryRunner, { manager });

    return queryRunner;
  }

  /**
   * @deprecated use .destroy method instead
   */
  close(): Promise<void> {
    throw new Error(
      'Cannot close virtual connection. Use the original DataSource object to close it',
    );
  }

  destroy(): Promise<void> {
    throw new Error(
      'Cannot destroy virtual connection. Use the original DataSource object to destoy it',
    );
  }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const RLSDataSource = RLSConnection;
