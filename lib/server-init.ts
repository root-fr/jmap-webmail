import { logger } from '@/lib/logger';

/**
 * Server initialization logging
 * Logs configuration on application startup for debugging and monitoring
 */

if (typeof window === 'undefined') {
  // Server-side only
  const config = {
    appName: process.env.APP_NAME || process.env.NEXT_PUBLIC_APP_NAME || 'Webmail',
    jmapServerUrl: process.env.JMAP_SERVER_URL || process.env.NEXT_PUBLIC_JMAP_SERVER_URL || '[NOT SET]',
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || '3000',
    hostname: process.env.HOSTNAME || '0.0.0.0',
    timezone: process.env.TZ || process.env.TIMEZONE || 'UTC',
    logLevel: process.env.LOG_LEVEL || 'info',
    logFormat: process.env.LOG_FORMAT || 'text',
    healthWarningThreshold: process.env.HEALTH_MEMORY_WARNING_THRESHOLD || '0.85',
    healthCriticalThreshold: process.env.HEALTH_MEMORY_CRITICAL_THRESHOLD || '0.95',
    nodeVersion: process.version,
  };

  logger.info('🚀 JMAP Webmail starting...', {
    appName: config.appName,
    environment: config.nodeEnv,
    nodeVersion: config.nodeVersion,
  });

  logger.info('📡 Server configuration', {
    port: config.port,
    hostname: config.hostname,
    timezone: config.timezone,
  });

  logger.info('🔧 Application configuration', {
    jmapServerUrl: config.jmapServerUrl !== '[NOT SET]' ? '✓ Configured' : '✗ Not configured',
    logLevel: config.logLevel,
    logFormat: config.logFormat,
  });

  logger.info('💚 Health check configuration', {
    warningThreshold: `${(parseFloat(config.healthWarningThreshold) * 100).toFixed(0)}%`,
    criticalThreshold: `${(parseFloat(config.healthCriticalThreshold) * 100).toFixed(0)}%`,
  });

  if (config.jmapServerUrl === '[NOT SET]') {
    logger.warn('⚠️  JMAP_SERVER_URL not configured - email functionality will not work');
  }

  logger.info('✓ Initialization complete');
}
