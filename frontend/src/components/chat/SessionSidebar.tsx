'use client';

import React, { useState, useCallback } from 'react';
import {
    MessageSquarePlus,
    MessageSquare,
    ChevronLeft,
    ChevronRight,
    Clock,
    Trash2,
    Check,
    X,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatSessionMeta } from '@/hooks/useChatSessions';

interface SessionSidebarProps {
    sessions: ChatSessionMeta[];
    isLoading: boolean;
    activeSessionId: number | null;
    onSelectSession: (sessionId: number) => void;
    onNewChat: () => void;
    onDeleteSession: (sessionId: number) => Promise<void>;
    onClearAll: () => Promise<void>;
}

function timeAgo(dateStr: string): string {
    const then = new Date(dateStr).getTime();
    const now = Date.now();
    const diff = Math.floor((now - then) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const SessionSidebar: React.FC<SessionSidebarProps> = ({
    sessions,
    isLoading,
    activeSessionId,
    onSelectSession,
    onNewChat,
    onDeleteSession,
    onClearAll,
}) => {
    const [collapsed, setCollapsed] = useState(false);
    // id of the session currently in "confirm delete" state
    const [confirmingId, setConfirmingId] = useState<number | null>(null);
    // whether the "clear all" confirm banner is showing
    const [confirmingClearAll, setConfirmingClearAll] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [clearingAll, setClearingAll] = useState(false);

    const handleTrashClick = useCallback(
        (e: React.MouseEvent, id: number) => {
            e.stopPropagation();
            setConfirmingId(id);
        },
        []
    );

    const handleCancelDelete = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmingId(null);
    }, []);

    const handleConfirmDelete = useCallback(
        async (e: React.MouseEvent, id: number) => {
            e.stopPropagation();
            setConfirmingId(null);
            setDeletingId(id);
            try {
                await onDeleteSession(id);
            } finally {
                setDeletingId(null);
            }
        },
        [onDeleteSession]
    );

    const handleConfirmClearAll = useCallback(async () => {
        setConfirmingClearAll(false);
        setClearingAll(true);
        try {
            await onClearAll();
        } finally {
            setClearingAll(false);
        }
    }, [onClearAll]);

    return (
        <aside
            className={`relative hidden md:flex flex-col shrink-0 border-r border-white/5 bg-black/20 backdrop-blur-sm transition-all duration-300 ease-in-out ${
                collapsed ? 'w-14' : 'w-60'
            }`}
        >
            {/* Toggle collapse */}
            <button
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="absolute -right-3 top-[72px] z-10 w-6 h-6 rounded-full bg-indigo-600 border border-indigo-500/40 flex items-center justify-center shadow-md hover:bg-indigo-500 transition-colors"
            >
                {collapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-white" />
                ) : (
                    <ChevronLeft className="w-3.5 h-3.5 text-white" />
                )}
            </button>

            {/* New Chat button */}
            <div className={`p-3 pt-4 ${collapsed ? 'flex justify-center' : ''}`}>
                <button
                    id="new-chat-btn"
                    onClick={onNewChat}
                    title="New Chat"
                    className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium bg-indigo-600/80 hover:bg-indigo-500/90 text-white transition-all hover:shadow-md hover:shadow-indigo-500/20 active:scale-95 ${
                        collapsed ? 'justify-center px-0' : ''
                    }`}
                >
                    <MessageSquarePlus className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>New Chat</span>}
                </button>
            </div>

            {/* History label */}
            {!collapsed && (
                <p className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 select-none">
                    History
                </p>
            )}

            {/* Session list */}
            <ScrollArea className="flex-1 overflow-hidden">
                <div className={`flex flex-col gap-0.5 px-1.5 pb-2 ${collapsed ? 'items-center' : ''}`}>
                    {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <div
                                key={i}
                                className={`rounded-xl bg-white/5 animate-pulse ${
                                    collapsed ? 'w-9 h-9' : 'h-14 w-full'
                                }`}
                                style={{ animationDelay: `${i * 80}ms` }}
                            />
                        ))
                    ) : sessions.length === 0 ? (
                        !collapsed && (
                            <p className="text-xs text-center text-muted-foreground/40 py-6 px-3">
                                No chats yet. Start a conversation!
                            </p>
                        )
                    ) : (
                        sessions.map((s) => {
                            const isActive = s.id === activeSessionId;
                            const isConfirming = confirmingId === s.id;
                            const isDeleting = deletingId === s.id;

                            return (
                                <div
                                    key={s.id}
                                    className={`group relative w-full rounded-xl transition-all duration-200 ${
                                        isActive
                                            ? 'bg-indigo-600/20 ring-1 ring-indigo-500/30'
                                            : 'hover:bg-white/5'
                                    } ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
                                >
                                    {/* Main session button */}
                                    <button
                                        onClick={() => !isConfirming && onSelectSession(s.id)}
                                        title={s.title}
                                        className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${
                                            collapsed ? 'flex justify-center p-2' : 'pr-8'
                                        } ${isActive ? 'text-indigo-200' : 'text-foreground/70 hover:text-foreground/90'}`}
                                    >
                                        {collapsed ? (
                                            <MessageSquare
                                                className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-muted-foreground'}`}
                                            />
                                        ) : (
                                            <div className="flex flex-col gap-0.5 min-w-0">
                                                <span className="text-xs font-medium truncate leading-tight">
                                                    {s.title}
                                                </span>
                                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                                                    <Clock className="w-2.5 h-2.5 shrink-0" />
                                                    <span>{timeAgo(s.updatedAt)}</span>
                                                </div>
                                                {s.lastMessage && (
                                                    <p className="text-[10px] text-muted-foreground/40 truncate leading-tight mt-0.5">
                                                        {s.lastMessage.isResponse ? '🤖 ' : '🙋 '}
                                                        {s.lastMessage.content}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </button>

                                    {/* Per-session delete — only shown in expanded mode */}
                                    {!collapsed && (
                                        <>
                                            {isConfirming ? (
                                                /* Inline confirm: ✓ / ✗ */
                                                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                                    <button
                                                        onClick={(e) => handleConfirmDelete(e, s.id)}
                                                        title="Confirm delete"
                                                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-red-500/80 hover:bg-red-500 text-white transition-colors"
                                                    >
                                                        <Check className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        onClick={handleCancelDelete}
                                                        title="Cancel"
                                                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-muted-foreground transition-colors"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ) : (
                                                /* Hover-reveal trash icon */
                                                <button
                                                    onClick={(e) => handleTrashClick(e, s.id)}
                                                    title="Delete chat"
                                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground/0 group-hover:text-muted-foreground/60 hover:!text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </ScrollArea>

            {/* ── Clear All footer ─────────────────────────────────────────── */}
            {!collapsed && sessions.length > 0 && (
                <div className="shrink-0 border-t border-white/5 px-3 py-2.5">
                    {confirmingClearAll ? (
                        <div className="flex items-center gap-2">
                            <p className="text-[11px] text-muted-foreground/60 flex-1 leading-tight">
                                Delete all {sessions.length} chat{sessions.length !== 1 ? 's' : ''}?
                            </p>
                            <button
                                id="confirm-clear-all-btn"
                                onClick={handleConfirmClearAll}
                                className="text-[11px] px-2 py-1 rounded-lg bg-red-500/80 hover:bg-red-500 text-white font-medium transition-colors"
                            >
                                Yes
                            </button>
                            <button
                                onClick={() => setConfirmingClearAll(false)}
                                className="text-[11px] px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-muted-foreground font-medium transition-colors"
                            >
                                No
                            </button>
                        </div>
                    ) : (
                        <button
                            id="clear-all-chats-btn"
                            onClick={() => setConfirmingClearAll(true)}
                            disabled={clearingAll}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-40 disabled:pointer-events-none"
                        >
                            <Trash2 className="w-3 h-3 shrink-0" />
                            {clearingAll ? 'Clearing…' : 'Clear all chats'}
                        </button>
                    )}
                </div>
            )}
        </aside>
    );
};
