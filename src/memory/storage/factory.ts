import { IStorageBackend, IStorageConfig, IStorageFactory } from './interface.js';
import { JSONStorage } from './json-storage.js';
import { SQLiteStorage } from './sqlite-storage.js';

/**
 * Factory for creating storage backends based on configuration.
 */
export class StorageFactory implements IStorageFactory {
  async create(config: IStorageConfig): Promise<IStorageBackend> {
    let backend: IStorageBackend;

    switch (config.type) {
      case 'json':
        backend = new JSONStorage(config);
        break;
      
      case 'sqlite':
        backend = new SQLiteStorage(config);
        break;
      
      case 'postgres':
        throw new Error('PostgreSQL storage not yet implemented');
      
      case 'custom':
        throw new Error('Custom storage requires providing a backend instance');
      
      default:
        throw new Error(`Unknown storage type: ${config.type}`);
    }

    // Initialize the backend
    await backend.initialize();
    
    return backend;
  }
}

/**
 * Create a storage backend from environment configuration.
 */
export async function createStorageFromEnv(): Promise<IStorageBackend> {
  const factory = new StorageFactory();
  
  // Determine storage type from environment
  const storageType = process.env.STORAGE_TYPE || 'json';
  
  // Build configuration based on storage type
  const config: IStorageConfig = {
    type: storageType as any,
  };

  // Add type-specific configuration
  switch (storageType) {
    case 'json':
      config.filePath = process.env.MEMORY_FILE_PATH;
      break;
    
    case 'sqlite':
      config.filePath = process.env.SQLITE_PATH || 'memory.db';
      break;
    
    case 'postgres':
      config.connectionString = process.env.DATABASE_URL;
      break;
  }

  return factory.create(config);
}