import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, initializeDatabase } from '../../../src/service/database-service/database.service.js';

export async function createDatabaseFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'language-local-app-integration-'));

  try {
    initializeDatabase(directory);
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }

  return async function dispose() {
    closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
  };
}
