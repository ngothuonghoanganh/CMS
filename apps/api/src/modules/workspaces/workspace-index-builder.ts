import { Injectable, type OnModuleInit } from '@nestjs/common';
import { WorkspaceDatabases } from '../../shared/persistence/workspace-databases.js';
import { WorkspacesRepository } from './workspaces.repository.js';

/**
 * Builds the collections and indexes of every workspace database before the API serves, like
 * `IndexBuilder` for the master (ADR-013, ADR-025): a new index reaches the databases already
 * there, and startup fails when one cannot be built.
 */
@Injectable()
export class WorkspaceIndexBuilder implements OnModuleInit {
  constructor(
    private readonly databases: WorkspaceDatabases,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  onModuleInit(): Promise<void> {
    return this.databases.buildAll(this.workspaces.allIds());
  }
}
