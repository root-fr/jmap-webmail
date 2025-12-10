import { useSettingsStore } from '@/stores/settings-store';

/**
 * Debug logger that respects the debugMode setting.
 * Use this instead of console.log for conditional debug output.
 */
export const debug = {
  /**
   * Log a debug message (only when debugMode is enabled)
   */
  log: (...args: unknown[]) => {
    if (useSettingsStore.getState().debugMode) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Log a warning message (only when debugMode is enabled)
   */
  warn: (...args: unknown[]) => {
    if (useSettingsStore.getState().debugMode) {
      console.warn('[DEBUG]', ...args);
    }
  },

  /**
   * Log an error message (always logs, regardless of debugMode)
   */
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },

  /**
   * Start a collapsed console group (only when debugMode is enabled)
   */
  group: (label: string) => {
    if (useSettingsStore.getState().debugMode) {
      console.group(`[DEBUG] ${label}`);
    }
  },

  /**
   * End a console group (only when debugMode is enabled)
   */
  groupEnd: () => {
    if (useSettingsStore.getState().debugMode) {
      console.groupEnd();
    }
  },

  /**
   * Start a performance timer (only when debugMode is enabled)
   */
  time: (label: string) => {
    if (useSettingsStore.getState().debugMode) {
      console.time(`[DEBUG] ${label}`);
    }
  },

  /**
   * End a performance timer (only when debugMode is enabled)
   */
  timeEnd: (label: string) => {
    if (useSettingsStore.getState().debugMode) {
      console.timeEnd(`[DEBUG] ${label}`);
    }
  },

  /**
   * Log a table (only when debugMode is enabled)
   */
  table: (data: unknown) => {
    if (useSettingsStore.getState().debugMode) {
      console.table(data);
    }
  }
};
