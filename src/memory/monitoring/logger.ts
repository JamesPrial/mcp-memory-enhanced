import { EventEmitter } from 'events';
import { metrics } from './metrics.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, any>;
  error?: Error;
  duration?: number;
  traceId?: string;
}

export class Logger extends EventEmitter {
  private level: LogLevel;
  private name: string;
  private buffer: LogEntry[] = [];
  private maxBufferSize: number;

  constructor(name: string, level: LogLevel = LogLevel.INFO, maxBufferSize: number = 1000) {
    super();
    this.name = name;
    this.level = level;
    this.maxBufferSize = maxBufferSize;
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error | Record<string, any>, context?: Record<string, any>): void {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, { ...context, error: error.message, stack: error.stack }, error);
    } else {
      this.log(LogLevel.ERROR, message, { ...context, ...error });
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    if (level < this.level) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context: {
        logger: this.name,
        ...context
      },
      error,
      traceId: context?.traceId || this.generateTraceId()
    };

    // Add to buffer
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    // Emit for handlers
    this.emit('log', entry);

    // Update metrics
    metrics.increment(`log_entries_total`, 1, { 
      logger: this.name, 
      level: LogLevel[level].toLowerCase() 
    });

    // Output to console in development
    if (process.env.NODE_ENV !== 'production') {
      this.consoleOutput(entry);
    }
  }

  private consoleOutput(entry: LogEntry): void {
    const levelStr = LogLevel[entry.level];
    const timestamp = entry.timestamp.toISOString();
    const contextStr = entry.context ? JSON.stringify(entry.context) : '';

    const message = `[${timestamp}] ${levelStr} [${this.name}] ${entry.message} ${contextStr}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.ERROR:
        console.error(message);
        if (entry.error) {
          console.error(entry.error);
        }
        break;
    }
  }

  // Create a child logger with additional context
  child(context: Record<string, any>): Logger {
    const childLogger = new Logger(`${this.name}:${context.name || 'child'}`, this.level);
    
    // Override log method to include parent context
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level, message, childContext, error) => {
      originalLog(level, message, { ...context, ...childContext }, error);
    };

    return childLogger;
  }

  // Utility for timing operations
  time(operation: string): () => void {
    const start = Date.now();
    const traceId = this.generateTraceId();

    this.debug(`Starting ${operation}`, { operation, traceId });

    return () => {
      const duration = Date.now() - start;
      this.info(`Completed ${operation}`, { operation, duration, traceId });
      metrics.observe(`operation_duration_seconds`, duration / 1000, [0.01, 0.05, 0.1, 0.5, 1, 5]);
    };
  }

  // Get buffered logs
  getBuffer(level?: LogLevel): LogEntry[] {
    if (level !== undefined) {
      return this.buffer.filter(entry => entry.level === level);
    }
    return [...this.buffer];
  }

  // Clear buffer
  clearBuffer(): void {
    this.buffer = [];
  }

  private generateTraceId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Set log level
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  // JSON formatter for structured logging
  toJSON(entry: LogEntry): string {
    return JSON.stringify({
      timestamp: entry.timestamp.toISOString(),
      level: LogLevel[entry.level],
      logger: this.name,
      message: entry.message,
      ...entry.context,
      ...(entry.error && {
        error: {
          message: entry.error.message,
          stack: entry.error.stack
        }
      })
    });
  }
}

// Global logger factory
const loggers = new Map<string, Logger>();

export function getLogger(name: string): Logger {
  if (!loggers.has(name)) {
    const level = process.env.LOG_LEVEL ? 
      LogLevel[process.env.LOG_LEVEL.toUpperCase() as keyof typeof LogLevel] || LogLevel.INFO :
      LogLevel.INFO;
    
    loggers.set(name, new Logger(name, level));
  }
  return loggers.get(name)!;
}

// Root logger
export const logger = getLogger('mcp-memory');