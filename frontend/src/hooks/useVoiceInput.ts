'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseVoiceInputOptions {
    onInterimTranscript?: (text: string) => void;
    onFinalTranscript?: (text: string) => void;
}

interface UseVoiceInputReturn {
    isListening: boolean;
    isSupported: boolean;
    startListening: () => void;
    stopListening: () => void;
}

function getSpeechRecognitionCtor(): typeof SpeechRecognition | null {
    if (typeof window === 'undefined') return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    return (w.SpeechRecognition ?? w.webkitSpeechRecognition) ?? null;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
    const { onInterimTranscript, onFinalTranscript } = options;
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    useEffect(() => {
        setIsSupported(!!getSpeechRecognitionCtor());
    }, []);

    const startListening = useCallback(() => {
        const Ctor = getSpeechRecognitionCtor();
        if (!Ctor) return;

        // Cleanup any existing session
        if (recognitionRef.current) {
            recognitionRef.current.abort();
        }

        const recognition = new Ctor();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }

            if (interimTranscript && onInterimTranscript) {
                onInterimTranscript(interimTranscript);
            }

            if (finalTranscript && onFinalTranscript) {
                onFinalTranscript(finalTranscript);
            }
        };

        recognition.onend = () => {
            setIsListening(false);
            recognitionRef.current = null;
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('SpeechRecognition error:', event.error);
            setIsListening(false);
            recognitionRef.current = null;
        };

        recognitionRef.current = recognition;
        recognition.start();
    }, [onInterimTranscript, onFinalTranscript]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, []);

    return { isListening, isSupported, startListening, stopListening };
}

