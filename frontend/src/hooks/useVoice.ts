import { useEffect, useRef, useState } from "react";

/* Minimal interface — Web Speech API isn't fully typed in TS lib */
type SpeechRecognitionEvent = {
  results: ArrayLike<{ 0: { transcript: string } }>;
};
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function useVoice(onResult: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    type SRConstructor = new () => SpeechRecognitionInstance;
    const SR =
      (window as unknown as { SpeechRecognition?: SRConstructor }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: SRConstructor }).webkitSpeechRecognition;

    if (!SR) {
      setSupported(false);
      return;
    }

    setSupported(true);
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      onResultRef.current(transcript);
      setRecording(false);
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => setRecording(false);
    recRef.current = rec;

    return () => {
      try { rec.stop(); } catch { /* noop */ }
      recRef.current = null;
    };
  }, []);

  const start = () => {
    if (!supported) {
      // Simulation fallback for unsupported browsers
      setRecording(true);
      setTimeout(() => {
        onResultRef.current("Logged a 20 minute run this morning");
        setRecording(false);
      }, 1500);
      return;
    }
    try {
      recRef.current?.start();
      setRecording(true);
    } catch {
      // already started or denied
      setRecording(false);
    }
  };

  const stop = () => {
    if (recRef.current) {
      try { recRef.current.stop(); } catch { /* noop */ }
    }
    setRecording(false);
  };

  return { recording, supported, start, stop };
}
