import { useState, useEffect, useCallback } from 'react';

export interface ChatSessionMeta {
    id: number;
    title: string;
    updatedAt: string;
    lastMessage: {
        content: string;
        isResponse: boolean;
        createdAt: string;
    } | null;
}

export function useChatSessions(subjectId?: number | null) {
    const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSessions = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const url = subjectId ? `/api/chat/sessions?subjectId=${subjectId}` : '/api/chat/sessions';
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to load sessions');
            const data: ChatSessionMeta[] = await res.json();
            setSessions(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, [subjectId]);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    return { sessions, isLoading, error, refresh: fetchSessions };
}
