/**
 * Structured logging utility for container/Kubernetes environments
 * 
 * Supports both human-readable and JSON formatted logs based on LOG_FORMAT env var.
 * Log levels: error, warn, info, debug
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogContext {
  [key: string]: unknown;
}

const LOG_FORMAT = process.env.LOG_FORMAT || 'text'; // 'text' or 'json'
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // error, warn, info, debug

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const COLORS = {
  error: '\x1b[31m', // Red
  warn: '\x1b[33m',  // Yellow
  info: '\x1b[36m',  // Cyan
  debug: '\x1b[90m', // Gray
  reset: '\x1b[0m',
};

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[LOG_LEVEL as LogLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const timestamp = formatTimestamp();

  if (LOG_FORMAT === 'json') {
    // JSON format for log aggregation tools (Fluentd, Loki, etc.)
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...context,
    };
    console.log(JSON.stringify(logEntry));
  } else {
    // Human-readable format
    const color = COLORS[level];
    const reset = COLORS.reset;
    const levelStr = level.toUpperCase().padEnd(5);
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    
    console.log(`${color}[${timestamp}] ${levelStr}${reset} ${message}${contextStr}`);
  }
}

export const logger = {
  error: (message: string, context?: LogContext) => log('error', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  
  // Request logging helper
  request: (method: string, path: string, status: number, duration: number) => {
    log('info', `${method} ${path} ${status}`, { duration: `${duration}ms` });
  },
};
