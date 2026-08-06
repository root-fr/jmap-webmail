import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FontSize = 'small' | 'medium' | 'large';
export type ListDensity = 'extra-compact' | 'compact' | 'regular' | 'comfortable';
export type DeleteAction = 'trash' | 'permanent';
export type ReplyMode = 'reply' | 'replyAll';
export type DateFormat = 'regional' | 'iso' | 'custom';
export type TimeFormat = '12h' | '24h';
export type FirstDayOfWeek = 0 | 1; // 0 = Sunday, 1 = Monday
export type ExternalContentPolicy = 'ask' | 'block' | 'allow';

interface SettingsState {
  // Appearance
  fontSize: FontSize;
  listDensity: ListDensity;
  animationsEnabled: boolean;

  // Language & Region
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  firstDayOfWeek: FirstDayOfWeek;

  // Email Behavior
  markAsReadDelay: number; // milliseconds (0 = instant, -1 = never)
  deleteAction: DeleteAction;
  showPreview: boolean;
  emailsPerPage: number;
  externalContentPolicy: ExternalContentPolicy;

  // Composer
  autoSaveDraftInterval: number; // milliseconds
  sendConfirmation: boolean;
  defaultReplyMode: ReplyMode;

  // Privacy & Security
  sessionTimeout: number; // minutes (0 = never)
  trustedSenders: string[]; // Email addresses that can load external content
  domainFaviconAvatars: boolean; // Use sender domain favicons as avatars (off by default; opt-in to avoid any third-party request)

  // Calendar Notifications
  calendarNotificationsEnabled: boolean;
  calendarNotificationSound: boolean;

  // Layout
  sidebarWidth: number;
  emailListWidth: number;

  // Advanced
  debugMode: boolean;

  // Actions
  updateSetting: <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K]
  ) => void;
  resetToDefaults: () => void;
  exportSettings: () => string;
  importSettings: (json: string) => boolean;

  // Trusted senders
  addTrustedSender: (email: string) => void;
  removeTrustedSender: (email: string) => void;
  isSenderTrusted: (email: string) => boolean;
}

const DEFAULT_SETTINGS = {
  // Appearance
  fontSize: 'medium' as FontSize,
  listDensity: 'regular' as ListDensity,
  animationsEnabled: true,

  // Language & Region
  dateFormat: 'regional' as DateFormat,
  timeFormat: '24h' as TimeFormat,
  firstDayOfWeek: 1 as FirstDayOfWeek, // Monday

  // Email Behavior
  markAsReadDelay: 0, // Instant
  deleteAction: 'trash' as DeleteAction,
  showPreview: true,
  emailsPerPage: 50,
  externalContentPolicy: 'ask' as ExternalContentPolicy,

  // Composer
  autoSaveDraftInterval: 60000, // 1 minute
  sendConfirmation: false,
  defaultReplyMode: 'reply' as ReplyMode,

  // Privacy & Security
  sessionTimeout: 0, // Never
  trustedSenders: [] as string[],
  domainFaviconAvatars: false,

  // Calendar Notifications
  calendarNotificationsEnabled: true,
  calendarNotificationSound: true,

  // Layout
  sidebarWidth: 256,
  emailListWidth: 384,

  // Advanced
  debugMode: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      updateSetting: (key, value) => {
        set({ [key]: value });

        // Apply font size to document root
        if (key === 'fontSize') {
          applyFontSize(value as FontSize);
        }

        // Apply list density to document root
        if (key === 'listDensity') {
          applyListDensity(value as ListDensity);
        }

        // Apply animations to document root
        if (key === 'animationsEnabled') {
          applyAnimations(value as boolean);
        }

        // Apply sidebar width to document root
        if (key === 'sidebarWidth') {
          applySidebarWidth(value as number);
        }

        // Apply email list width to document root
        if (key === 'emailListWidth') {
          applyEmailListWidth(value as number);
        }
      },

      resetToDefaults: () => {
        set(DEFAULT_SETTINGS);
        applyFontSize(DEFAULT_SETTINGS.fontSize);
        applyListDensity(DEFAULT_SETTINGS.listDensity);
        applyAnimations(DEFAULT_SETTINGS.animationsEnabled);
        applySidebarWidth(DEFAULT_SETTINGS.sidebarWidth);
        applyEmailListWidth(DEFAULT_SETTINGS.emailListWidth);
      },

      exportSettings: () => {
        const state = get();
        const settings = {
          fontSize: state.fontSize,
          listDensity: state.listDensity,
          animationsEnabled: state.animationsEnabled,
          dateFormat: state.dateFormat,
          timeFormat: state.timeFormat,
          firstDayOfWeek: state.firstDayOfWeek,
          markAsReadDelay: state.markAsReadDelay,
          deleteAction: state.deleteAction,
          showPreview: state.showPreview,
          emailsPerPage: state.emailsPerPage,
          externalContentPolicy: state.externalContentPolicy,
          trustedSenders: state.trustedSenders,
          autoSaveDraftInterval: state.autoSaveDraftInterval,
          sendConfirmation: state.sendConfirmation,
          defaultReplyMode: state.defaultReplyMode,
          sessionTimeout: state.sessionTimeout,
          calendarNotificationsEnabled: state.calendarNotificationsEnabled,
          calendarNotificationSound: state.calendarNotificationSound,
          sidebarWidth: state.sidebarWidth,
          emailListWidth: state.emailListWidth,
          debugMode: state.debugMode,
        };
        return JSON.stringify(settings, null, 2);
      },

      importSettings: (json: string) => {
        try {
          const settings = JSON.parse(json);

          // Validate settings
          if (typeof settings !== 'object' || settings === null) {
            return false;
          }

          // Apply settings
          Object.keys(settings).forEach((key) => {
            if (key in DEFAULT_SETTINGS) {
              set({ [key]: settings[key] });
            }
          });

          // Apply visual settings
          applyFontSize(get().fontSize);
          applyListDensity(get().listDensity);
          applyAnimations(get().animationsEnabled);
          applySidebarWidth(get().sidebarWidth);
          applyEmailListWidth(get().emailListWidth);

          return true;
        } catch {
          return false;
        }
      },

      // Trusted senders methods
      addTrustedSender: (email: string) => {
        const normalizedEmail = email.toLowerCase().trim();
        const current = get().trustedSenders;
        if (!current.includes(normalizedEmail)) {
          set({ trustedSenders: [...current, normalizedEmail] });
        }
      },

      removeTrustedSender: (email: string) => {
        const normalizedEmail = email.toLowerCase().trim();
        set({
          trustedSenders: get().trustedSenders.filter(e => e !== normalizedEmail)
        });
      },

      isSenderTrusted: (email: string) => {
        const normalizedEmail = email.toLowerCase().trim();
        return get().trustedSenders.includes(normalizedEmail);
      },
    }),
    {
      name: 'settings-storage',
      version: 1,
    }
  )
);

// Helper functions to apply settings to DOM
function applyFontSize(size: FontSize) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const sizeMap = {
    small: '14px',
    medium: '16px',
    large: '18px',
  };
  root.style.setProperty('--font-size-base', sizeMap[size]);
}

function applyListDensity(density: ListDensity) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const densityMap: Record<ListDensity, string> = {
    'extra-compact': '28px',
    compact: '32px',
    regular: '48px',
    comfortable: '64px',
  };
  root.style.setProperty('--list-item-height', densityMap[density]);
  root.dataset.density = density;
}

function applySidebarWidth(width: number) {
  if (typeof document === 'undefined') return;

  document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
}

function applyEmailListWidth(width: number) {
  if (typeof document === 'undefined') return;

  document.documentElement.style.setProperty('--email-list-width', `${width}px`);
}

function applyAnimations(enabled: boolean) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  if (enabled) {
    root.style.removeProperty('--transition-duration');
  } else {
    root.style.setProperty('--transition-duration', '0s');
  }
}

// Initialize settings on load
if (typeof window !== 'undefined') {
  const store = useSettingsStore.getState();
  applyFontSize(store.fontSize);
  applyListDensity(store.listDensity);
  applyAnimations(store.animationsEnabled);
  applySidebarWidth(store.sidebarWidth);
  applyEmailListWidth(store.emailListWidth);
}
