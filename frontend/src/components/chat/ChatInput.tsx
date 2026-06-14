'use client';

import React, { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Square, Mic, MicOff, Image as ImageIcon, X, Crop, HelpCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useVoiceInput } from '@/hooks/useVoiceInput';

interface ChatInputProps {
    onSendMessage: (
        message: string, 
        bookOnlyMode?: boolean, 
        uploadedImage?: string | null, 
        cropRegion?: { x1: number; y1: number; x2: number; y2: number } | null
    ) => void;
    onStop: () => void;
    isGenerating: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
    onSendMessage,
    onStop,
    isGenerating,
}) => {
    const [input, setInput] = useState('');
    const [bookOnly, setBookOnly] = useState(false);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [cropType, setCropType] = useState<'full' | 'circuit' | 'equation'>('full');
    const [altText, setAltText] = useState('');
    const [showHelp, setShowHelp] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const committedInputRef = useRef('');

    const { isListening, isSupported, startListening, stopListening } = useVoiceInput({
        onInterimTranscript: (interim) => {
            setInput(committedInputRef.current + interim);
        },
        onFinalTranscript: (final) => {
            const prefix = committedInputRef.current;
            const separator = prefix && !prefix.endsWith(' ') ? ' ' : '';
            committedInputRef.current = prefix + separator + final;
            setInput(committedInputRef.current);
        },
    });

    const handleMicToggle = () => {
        if (isListening) {
            stopListening();
        } else {
            committedInputRef.current = input;
            startListening();
        }
    };

    const getCropRegion = () => {
        if (cropType === 'circuit') {
            return { x1: 20, y1: 30, x2: 80, y2: 90 }; // Crop coordinates for circuit
        }
        if (cropType === 'equation') {
            return { x1: 5, y1: 10, x2: 95, y2: 45 };  // Crop coordinates for equation
        }
        return null; // Full image
    };

    const handleSend = () => {
        if ((input.trim() || uploadedImage) && !isGenerating) {
            if (isListening) stopListening();
            const cropRegion = getCropRegion();
            onSendMessage(input, bookOnly, uploadedImage, cropRegion);
            setInput('');
            setUploadedImage(null);
            setCropType('full');
            setAltText('');
            committedInputRef.current = '';
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    const processFile = (file: File) => {
        // Enforce maximum file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('File size exceeds the 5MB limit.');
            return;
        }

        // Validate MIME type
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            alert('Unsupported format. Please upload a PNG, JPEG, or WEBP image.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                setUploadedImage(event.target.result as string);
                setAltText(file.name);
            }
        };
        reader.readAsDataURL(file);
    };

    // Paste handler to support pasting images from clipboard
    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData?.items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        processFile(file);
                        e.preventDefault();
                        break;
                    }
                }
            }
        }
    };

    return (
        <div className="relative w-full max-w-3xl mx-auto mt-2">
            {/* Mode selection toggle & Help */}
            <div className="flex gap-2 mb-2 items-center justify-between">
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setBookOnly(false)}
                        className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-full border transition-all cursor-pointer ${
                            !bookOnly
                                ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40"
                                : "bg-slate-800 text-muted-foreground border-border/40 hover:bg-slate-700"
                        }`}
                    >
                        Syllabus Search Mode
                    </button>
                    <button
                        type="button"
                        onClick={() => setBookOnly(true)}
                        className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-full border transition-all cursor-pointer ${
                            bookOnly
                                ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40"
                                : "bg-slate-800 text-muted-foreground border-border/40 hover:bg-slate-700"
                        }`}
                    >
                        Book Only Mode
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => setShowHelp(!showHelp)}
                    className="text-muted-foreground hover:text-indigo-400 transition-colors p-1"
                    title="Accessibility & Usage Information"
                >
                    <HelpCircle className="h-4 w-4" />
                </button>
            </div>

            {/* Accessibility / Help Box */}
            {showHelp && (
                <div className="bg-slate-900/95 border border-indigo-500/20 rounded-xl p-3 mb-2 text-xs leading-relaxed text-indigo-200">
                    <h4 className="font-semibold mb-1 text-white">Accessibility & Multimodal Help</h4>
                    <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Keyboard:</strong> Submit using <kbd className="px-1 bg-slate-800 rounded text-[10px]">Enter</kbd>, use <kbd className="px-1 bg-slate-800 rounded text-[10px]">Shift+Enter</kbd> for newlines.</li>
                        <li><strong>Voice Input:</strong> Click the microphone to dictate queries. Translation is fully grounded.</li>
                        <li><strong>Pasting Images:</strong> Copy an image to your clipboard and paste (<kbd className="px-1 bg-slate-800 rounded text-[10px]">Ctrl+V</kbd>) directly into the chat input.</li>
                        <li><strong>Image Size Limit:</strong> Enforces a maximum file upload size of 5MB.</li>
                    </ul>
                </div>
            )}

            {/* Image Preview & Crop controls */}
            {uploadedImage && (
                <div className="flex flex-col md:flex-row gap-3 p-3 mb-2 bg-slate-950/80 border border-indigo-500/20 rounded-xl animate-fadeIn items-start md:items-center justify-between">
                    <div className="flex gap-3 items-center min-w-0">
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10 shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                                src={uploadedImage} 
                                alt={altText || "Uploaded image preview"} 
                                className={`w-full h-full object-cover transition-all ${
                                    cropType === 'circuit' ? 'scale-150 origin-center' :
                                    cropType === 'equation' ? 'scale-y-75 origin-top' : ''
                                }`} 
                            />
                            <div className="absolute inset-0 bg-slate-950/20 flex items-center justify-center">
                                <Crop className="h-4 w-4 text-white drop-shadow" />
                            </div>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">Image Selected</p>
                            <input
                                type="text"
                                value={altText}
                                onChange={(e) => setAltText(e.target.value)}
                                placeholder="Describe the image (Alt Text)..."
                                className="text-[10px] bg-transparent text-indigo-300/80 focus:text-indigo-200 focus:outline-none border-b border-indigo-500/10 focus:border-indigo-500/40 w-full mt-1"
                                aria-label="Alternative Text"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 items-center w-full md:w-auto justify-end">
                        <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-white/5">
                            <span className="text-[10px] text-muted-foreground font-medium">Crop Mode:</span>
                            {(['full', 'circuit', 'equation'] as const).map((type) => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setCropType(type)}
                                    className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase transition-colors cursor-pointer ${
                                        cropType === type
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>

                        <Button
                            type="button"
                            onClick={() => setUploadedImage(null)}
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            )}

            <div
                className={`relative flex items-end p-2 pb-0 pt-0 bg-background/60 shadow-lg ring-1 rounded-2xl backdrop-blur-xl group transition-all duration-300 ${
                    isListening
                        ? 'ring-red-500/60 hover:ring-red-500/80'
                        : 'ring-white/10 hover:ring-indigo-500/40'
                }`}
            >
                {/* Image upload helper input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    className="hidden"
                    aria-label="Upload Diagram/Image"
                />

                <Button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 rounded-xl text-muted-foreground hover:text-indigo-400 hover:bg-white/10 transition-colors shrink-0 mb-2 ml-1"
                    title="Upload diagram, photo, or PDF screenshot (max 5MB)"
                >
                    <ImageIcon className="h-5 w-5" />
                </Button>

                <Textarea
                    value={input}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                        setInput(e.target.value);
                        if (!isListening) {
                            committedInputRef.current = e.target.value;
                        }
                    }}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={isListening ? 'Listening…' : 'Ask a question about the syllabus, paste or drag a diagram...'}
                    className={`min-h-[52px] max-h-[200px] w-full resize-none border-0 bg-transparent focus-visible:ring-0 px-4 py-3 text-base shadow-none outline-none focus:outline-none transition-all font-medium ${
                        isListening
                            ? 'placeholder:text-red-400/70 animate-pulse'
                            : 'placeholder:text-muted-foreground/50'
                    }`}
                    rows={1}
                />
                <div className="flex shrink-0 p-2 pl-0 gap-2 items-center mb-0.5 ml-1">
                    {/* Microphone button — hidden on unsupported browsers */}
                    {isSupported && (
                        <div className="relative">
                            {isListening && (
                                <span className="absolute inset-0 rounded-xl bg-red-500/30 animate-ping" />
                            )}
                            <Button
                                id="voice-input-btn"
                                onClick={handleMicToggle}
                                size="icon"
                                variant="ghost"
                                className={`relative h-9 w-9 rounded-xl transition-all hover:scale-105 ${
                                    isListening
                                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-500/30'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
                                }`}
                                aria-label={isListening ? 'Stop recording' : 'Start voice input'}
                            >
                                {isListening ? (
                                    <MicOff className="h-4 w-4" />
                                ) : (
                                    <Mic className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    )}

                    {isGenerating ? (
                        <Button
                            id="stop-generation-btn"
                            onClick={onStop}
                            size="icon"
                            variant="destructive"
                            className="h-9 w-9 rounded-xl shadow-md transition-transform hover:scale-105"
                        >
                            <Square className="h-4 w-4 fill-current" />
                        </Button>
                    ) : (
                        <Button
                            id="send-message-btn"
                            onClick={handleSend}
                            disabled={!input.trim() && !uploadedImage}
                            size="icon"
                            className="h-9 w-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
            <p className="text-center text-xs text-muted-foreground/60 mt-3 font-medium">
                SyllabiQ AI can make mistakes. Consider checking important information.
            </p>
        </div>
    );
};
