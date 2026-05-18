import { useState, useRef, useCallback } from "react";
import { Mic, MicOff } from "lucide-react";

interface VoiceInputButtonProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function VoiceInputButton({ value, onChange, className = "" }: VoiceInputButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const baseValueRef = useRef("");
  const finalBufferRef = useRef("");

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }

    const recognition = new SpeechRecognition();
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
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [value, onChange]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return (
    <button
      type="button"
      onClick={toggle}
      title={isListening ? "Stop voice input" : "Start voice input"}
      className={`p-2 rounded border transition-colors shrink-0 ${
        isListening
          ? "bg-red-500/20 border-red-500 text-red-400 animate-pulse"
          : "bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-muted)] hover:border-accent hover:text-accent"
      } ${className}`}
    >
      {isListening ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  );
}
