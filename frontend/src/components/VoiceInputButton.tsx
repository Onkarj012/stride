import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2, AlertCircle } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";

interface VoiceInputButtonProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const SpeechRecognitionCtor =
  typeof window !== "undefined"
    ? (window.SpeechRecognition || window.webkitSpeechRecognition) as SpeechRecognitionConstructor
    : null;
const supportsNative = !!SpeechRecognitionCtor;

type VoiceState = "idle" | "listening" | "processing" | "error";

export function VoiceInputButton({ value, onChange, className = "" }: VoiceInputButtonProps) {
  const transcribeAction = useAction(api.ai.transcribe);
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const baseValueRef = useRef("");
  const finalBufferRef = useRef("");
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const showError = useCallback((msg: string) => {
    setError(msg);
    setState("error");
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => {
      setError("");
      setState("idle");
    }, 6000);
  }, []);

  const clearError = useCallback(() => {
    setError("");
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
  }, []);

  const stopNative = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setState("idle");
  }, []);

  const startNativeListening = useCallback(() => {
    if (!SpeechRecognitionCtor) return;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    baseValueRef.current = value;
    finalBufferRef.current = "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalBufferRef.current += transcript + " ";
        } else {
          interim += transcript;
        }
      }
      onChange(baseValueRef.current + finalBufferRef.current + interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        showError("Mic denied");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        showError("Try again");
      }
      setState("idle");
    };

    recognition.onend = () => {
      setState("idle");
    };

    recognition.start();
    recognitionRef.current = recognition;
    setState("listening");
    clearError();
  }, [value, onChange, showError, clearError]);

  const stopFallback = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setState("idle");
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startFallbackRecording = useCallback(async () => {
    try {
      clearError();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        cleanupStream();

        if (chunksRef.current.length === 0) {
          showError("No audio");
          return;
        }

        const blob = new Blob(chunksRef.current, { type: mimeType });
        setState("processing");

        try {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const data = await transcribeAction({ audio: base64, mimeType: blob.type });

          baseValueRef.current = value;
          onChange(baseValueRef.current + data.transcript + " ");
          setState("idle");
        } catch (err: any) {
          showError(err.message || "Set GROQ_API_KEY?");
        }
      };

      recorder.onerror = () => {
        cleanupStream();
        showError("Failed");
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setState("listening");
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        showError("Mic denied");
      } else {
        showError("No mic");
      }
    }
  }, [value, onChange, transcribeAction, cleanupStream, showError, clearError]);

  const startListening = useCallback(() => {
    if (supportsNative) {
      startNativeListening();
    } else {
      startFallbackRecording();
    }
  }, [startNativeListening, startFallbackRecording]);

  const stopListening = useCallback(() => {
    if (supportsNative) {
      stopNative();
    } else {
      stopFallback();
    }
  }, [stopNative, stopFallback]);

  const toggle = useCallback(() => {
    if (state === "listening") {
      stopListening();
    } else if (state === "idle") {
      startListening();
    }
  }, [state, startListening, stopListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      stopFallback();
      cleanupStream();
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [stopFallback, cleanupStream]);

  const isListening = state === "listening";
  const isProcessing = state === "processing";
  const isError = state === "error";

  return (
    <span className={`inline-flex ${className}`}>
      <span className="relative inline-flex">
        <motion.button
          type="button"
          onClick={toggle}
          disabled={isProcessing}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          title={
            isProcessing
              ? "Transcribing audio..."
              : isListening
                ? "Click to stop"
                : isError
                  ? error
                  : supportsNative
                    ? "Voice input"
                    : "Record audio"
          }
          className={`p-2 rounded border transition-colors flex items-center justify-center will-change-transform ${
            isListening
              ? "bg-red-500/20 border-red-500 text-red-400"
              : isError
                ? "bg-amber-500/20 border-amber-500 text-amber-400"
                : "bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-muted)] hover:border-accent hover:text-accent"
          } ${isProcessing ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isProcessing ? (
              <motion.span
                key="processing"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
              >
                <Loader2 size={16} className="animate-spin" />
              </motion.span>
            ) : isListening ? (
              <motion.span
                key="listening"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: [1, 1.1, 1] }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ scale: { repeat: Infinity, duration: 1 }, opacity: { duration: 0.15 } }}
              >
                <MicOff size={16} />
              </motion.span>
            ) : isError ? (
              <motion.span
                key="error"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
              >
                <AlertCircle size={16} />
              </motion.span>
            ) : (
              <motion.span
                key="idle"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
              >
                <Mic size={16} />
              </motion.span>
            )}
          </AnimatePresence>
          {isListening && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full"
            />
          )}
        </motion.button>
        <AnimatePresence>
          {isListening && (
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-red-400 whitespace-nowrap leading-none tracking-wider"
            >
              REC
            </motion.span>
          )}
          {error && (
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-amber-400 whitespace-nowrap leading-none"
            >
              {error}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </span>
  );
}
