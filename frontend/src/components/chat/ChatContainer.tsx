"use client";

import React, { useEffect, useRef, useCallback } from 'react';
import { useChatStream } from '@/hooks/useChatStream';
import { useChatSessions } from '@/hooks/useChatSessions';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { SessionSidebar } from './SessionSidebar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GraduationCap, LogOut, Sparkles } from 'lucide-react';
import { logout } from '@/actions/auth';

import Link from 'next/link';

interface ChatContainerProps {
    userInitials: string;
    userName: string;
    userId: number;
    subjectId?: number | null;
    initialSessionId?: number | null;
}

export const ChatContainer = ({ userInitials, userName, userId, subjectId = null, initialSessionId = null }: ChatContainerProps) => {
    const { sessions, isLoading: sessionsLoading, refresh: refreshSessions } = useChatSessions(subjectId);

    const {
        messages,
        isGenerating,
        error,
        sessionId,
        sendMessage,
        loadMessages,
        resetChat,
        stopGeneration,
    } = useChatStream({
        initialSessionId: initialSessionId,
        subjectId: subjectId,
        onSessionCreated: () => {
            // Refresh sidebar whenever a brand-new session is created
            refreshSessions();
        },
    });

    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // When user clicks a session in the sidebar
    const handleSelectSession = useCallback(
        async (selectedSessionId: number) => {
            if (selectedSessionId === sessionId) return; // already active

            try {
                const res = await fetch(`/api/chat/messages?sessionId=${selectedSessionId}`);
                if (!res.ok) throw new Error('Failed to load messages');
                const data = await res.json();
                loadMessages(data, selectedSessionId);
            } catch (err) {
                console.error('Failed to load session messages:', err);
            }
        },
        [sessionId, loadMessages]
    );

    const handleNewChat = useCallback(() => {
        resetChat();
    }, [resetChat]);

    // Delete a single session; if it was active, reset to new-chat view
    const handleDeleteSession = useCallback(
        async (targetSessionId: number) => {
            const res = await fetch(`/api/chat/sessions/${targetSessionId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete session');
            if (targetSessionId === sessionId) resetChat();
            await refreshSessions();
        },
        [sessionId, resetChat, refreshSessions]
    );

    // Delete all sessions for this user
    const handleClearAll = useCallback(async () => {
        const res = await fetch('/api/chat/sessions', { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to clear all sessions');
        resetChat();
        await refreshSessions();
    }, [resetChat, refreshSessions]);

    // After a message completes streaming, refresh session list so metadata (title, last msg) updates
    const prevGenerating = useRef(isGenerating);
    useEffect(() => {
        if (prevGenerating.current && !isGenerating && sessionId) {
            refreshSessions();
        }
        prevGenerating.current = isGenerating;
    }, [isGenerating, sessionId, refreshSessions]);

    return (
        <div className="flex h-screen max-h-screen overflow-hidden">
            {/* ── Fixed Header ──────────────────────────────────────────────── */}
            <header className="fixed top-0 inset-x-0 h-16 bg-background/80 backdrop-blur-md border-b border-border/50 flex items-center px-4 md:px-6 z-50 shadow-sm">
                <div className="flex items-center space-x-2">
                    <div className="bg-indigo-600 p-1.5 rounded-lg shadow-inner">
                        <GraduationCap className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold tracking-tight leading-none text-foreground/90">
                            SyllabiQ
                        </h1>
                        <p className="text-xs text-muted-foreground font-medium mt-0.5">
                            Your intelligent learning assistant
                        </p>
                    </div>
                    <Link
                        href="/student/dashboard"
                        className="ml-6 px-3 py-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-xs font-semibold text-indigo-300 hover:text-white rounded-lg border border-indigo-500/20 transition-all"
                    >
                        Back to Dashboard
                    </Link>
                </div>

                {/* User section */}
                <div className="flex items-center gap-3 ml-auto">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-600/80 ring-1 ring-indigo-500/40 flex items-center justify-center text-xs font-semibold text-white select-none">
                            {userInitials}
                        </div>
                        <span className="text-sm text-muted-foreground hidden sm:block">{userName}</span>
                    </div>
                    <form action={logout}>
                        <button
                            type="submit"
                            title="Sign out"
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </form>
                </div>
            </header>

            {/* ── Body: Sidebar + Chat ──────────────────────────────────────── */}
            <div className="flex w-full pt-16 h-full overflow-hidden">
                {/* Sidebar */}
                <SessionSidebar
                    sessions={sessions}
                    isLoading={sessionsLoading}
                    activeSessionId={sessionId}
                    onSelectSession={handleSelectSession}
                    onNewChat={handleNewChat}
                    onDeleteSession={handleDeleteSession}
                    onClearAll={handleClearAll}
                />

                {/* Main Chat Area */}
                <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                    <ScrollArea className="flex-1 w-full pb-4 px-4 overflow-y-auto">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center pt-24 pb-8 max-w-2xl mx-auto">
                                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6 shadow-inner ring-1 ring-white/10">
                                    <Sparkles className="h-8 w-8 text-indigo-400" />
                                </div>
                                <h2 className="text-3xl font-semibold tracking-tight mb-2 bg-gradient-to-br from-white via-indigo-100 to-indigo-400 bg-clip-text text-transparent">
                                    Hello there.
                                </h2>
                                <p className="text-muted-foreground text-center max-w-md mb-8 text-[15px] leading-relaxed">
                                    I&apos;m SyllabiQ. I can answer questions directly from your
                                    university syllabus. What would you like to know today?
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-lg mt-2">
                                    {[
                                        'What is CPU scheduling?',
                                        'What is the difference between a queue and a stack?',
                                        'What is a System Call? Give examples.',
                                        'How is a graph represented in memory?',
                                    ].map((suggestion, i) => (
                                        <button
                                            key={i}
                                            onClick={() => sendMessage(suggestion)}
                                            className="bg-background/40 hover:bg-white/5 border border-white/5 p-4 rounded-xl text-left text-sm text-foreground/80 hover:text-indigo-200 transition-all duration-300 backdrop-blur-sm shadow-sm hover:shadow-indigo-500/10 hover:-translate-y-0.5"
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col pb-8 space-y-2">
                                {messages.map((msg) => (
                                    <MessageBubble
                                        key={msg.id}
                                        role={msg.role}
                                        content={msg.content}
                                        isStreaming={msg.isStreaming}
                                        metadata={msg.metadata}
                                    />
                                ))}
                                {error && (
                                    <div className="w-full max-w-3xl mx-auto mt-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                        <p className="text-red-400 text-sm font-medium">
                                            Error: {error}
                                        </p>
                                    </div>
                                )}
                                <div ref={bottomRef} className="h-1" />
                            </div>
                        )}
                    </ScrollArea>

                    {/* Input Area */}
                    <div className="p-4 md:px-6 md:pb-6 bg-gradient-to-t from-background via-background/95 to-transparent w-full shrink-0">
                        <ChatInput
                            onSendMessage={sendMessage}
                            onStop={stopGeneration}
                            isGenerating={isGenerating}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
