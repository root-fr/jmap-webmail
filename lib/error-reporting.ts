import { debug } from "./debug";

interface ErrorReport {
  error: Error;
  errorInfo?: React.ErrorInfo;
  zone: string;
  timestamp: Date;
  userAgent: string;
  url: string;
}

/**
 * Report an error to the logging system.
 * In debug mode, logs detailed information to the console.
 * Future: Can be extended to send to external error tracking services.
 */
export function reportError(
  error: Error,
  zone: string,
  errorInfo?: React.ErrorInfo
): void {
  const report: ErrorReport = {
    error,
    errorInfo,
    zone,
    timestamp: new Date(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "SSR",
    url: typeof window !== "undefined" ? window.location.href : "",
  };

  // Always log errors
  debug.error(`[ErrorBoundary:${zone}]`, error.message, {
    stack: error.stack,
    componentStack: errorInfo?.componentStack,
    url: report.url,
    timestamp: report.timestamp.toISOString(),
  });

  // Future: Send to error tracking service (Sentry, etc.)
  // if (process.env.NODE_ENV === 'production') {
  //   sendToErrorService(report);
  // }
}
