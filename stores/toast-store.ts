import { create } from "zustand";
import { Toast } from "@/components/ui/toast";

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 11);
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000, // Default 5 seconds
    };

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },

  clearToasts: () => {
    set({ toasts: [] });
  },
}));

// Helper functions for common toast types
export const toast = {
  success: (title: string, message?: string) => {
    useToastStore.getState().addToast({ type: "success", title, message });
  },
  error: (title: string, message?: string) => {
    useToastStore.getState().addToast({ type: "error", title, message, duration: 10000 });
  },
  info: (title: string, message?: string) => {
    useToastStore.getState().addToast({ type: "info", title, message });
  },
  warning: (title: string, message?: string) => {
    useToastStore.getState().addToast({ type: "warning", title, message });
  },
};