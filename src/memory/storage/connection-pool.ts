import Database from 'better-sqlite3';
import { EventEmitter } from 'events';

interface PoolConfig {
  filePath: string;
  maxConnections?: number;
  idleTimeout?: number;
}

interface PooledConnection {
  db: Database.Database;
  inUse: boolean;
  lastUsed: number;
  id: number;
}

export class SQLiteConnectionPool extends EventEmitter {
  private connections: PooledConnection[] = [];
  private config: Required<PoolConfig>;
  private nextId = 1;

  constructor(config: PoolConfig) {
    super();
    this.config = {
      filePath: config.filePath,
      maxConnections: config.maxConnections || 5,
      idleTimeout: config.idleTimeout || 60000 // 1 minute
    };
    this.startIdleChecker();
  }

  async getConnection(): Promise<Database.Database> {
    // Try to find an available connection
    for (const conn of this.connections) {
      if (!conn.inUse) {
        conn.inUse = true;
        conn.lastUsed = Date.now();
        return conn.db;
      }
    }

    // Create new connection if under limit
    if (this.connections.length < this.config.maxConnections) {
      const db = new Database(this.config.filePath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      
      const conn: PooledConnection = {
        db,
        inUse: true,
        lastUsed: Date.now(),
        id: this.nextId++
      };
      
      this.connections.push(conn);
      this.emit('connection:created', conn.id);
      return db;
    }

    // Wait for a connection to become available
    return new Promise((resolve) => {
      const checkAvailable = () => {
        for (const conn of this.connections) {
          if (!conn.inUse) {
            conn.inUse = true;
            conn.lastUsed = Date.now();
            resolve(conn.db);
            return;
          }
        }
        setTimeout(checkAvailable, 10);
      };
      checkAvailable();
    });
  }

  releaseConnection(db: Database.Database): void {
    const conn = this.connections.find(c => c.db === db);
    if (conn) {
      conn.inUse = false;
      conn.lastUsed = Date.now();
      this.emit('connection:released', conn.id);
    }
  }

  private startIdleChecker(): void {
    setInterval(() => {
      const now = Date.now();
      this.connections = this.connections.filter(conn => {
        if (!conn.inUse && now - conn.lastUsed > this.config.idleTimeout) {
          conn.db.close();
          this.emit('connection:closed', conn.id);
          return false;
        }
        return true;
      });
    }, 30000); // Check every 30 seconds
  }

  async close(): Promise<void> {
    for (const conn of this.connections) {
      conn.db.close();
    }
    this.connections = [];
    this.emit('pool:closed');
  }
}