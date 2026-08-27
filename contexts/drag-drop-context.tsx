"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Email } from "@/lib/jmap/types";

type DragType = 'email' | 'mailbox';

// Wire shape of the drag payload ("application/x-email-ids"): id plus owning
// account so merged-view drops route each row through its own account.
export interface DraggedEmailRef {
  id: string;
  accountId?: string;
}

interface DragDropState {
  isDragging: boolean;
  dragType: DragType | null;
  draggedEmails: Email[];
  dragCount: number;
  sourceMailboxId: string | null;
  draggedMailboxId: string | null;
}

interface DragDropContextValue extends DragDropState {
  startDrag: (emails: Email[], sourceMailboxId: string, type?: DragType) => void;
  startMailboxDrag: (mailboxId: string) => void;
  endDrag: () => void;
}

const initialState: DragDropState = {
  isDragging: false,
  dragType: null,
  draggedEmails: [],
  dragCount: 0,
  sourceMailboxId: null,
  draggedMailboxId: null,
};

const DragDropContext = createContext<DragDropContextValue | null>(null);

export function DragDropProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DragDropState>(initialState);

  const startDrag = useCallback((emails: Email[], sourceMailboxId: string, type: DragType = 'email') => {
    setState({
      isDragging: true,
      dragType: type,
      draggedEmails: emails,
      dragCount: emails.length,
      sourceMailboxId,
      draggedMailboxId: null,
    });
  }, []);

  const startMailboxDrag = useCallback((mailboxId: string) => {
    setState({
      isDragging: true,
      dragType: 'mailbox',
      draggedEmails: [],
      dragCount: 0,
      sourceMailboxId: null,
      draggedMailboxId: mailboxId,
    });
  }, []);

  const endDrag = useCallback(() => {
    setState(initialState);
  }, []);

  return (
    <DragDropContext.Provider value={{ ...state, startDrag, startMailboxDrag, endDrag }}>
      {children}
    </DragDropContext.Provider>
  );
}

export function useDragDropContext() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error("useDragDropContext must be used within DragDropProvider");
  }
  return context;
}
