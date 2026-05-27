import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Records audio via MediaRecorder, transcribes via Groq Whisper through Convex action.
 * Returns the transcript via callback. Falls back to Web Speech API if MediaRecorder fails.
 */
export function useAudioRecorder(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const transcribe = useAction(api.ai.transcribe);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick a supported mime type
      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/wav"];
      const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "audio/webm";

      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanup();
        if (blob.size === 0) { setRecording(false); return; }

        setTranscribing(true);
        try {
          // Convert to base64 (no data URL prefix)
          const arrayBuffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          const base64 = btoa(binary);

          const result = await transcribe({ audio: base64, mimeType: mimeType.split(";")[0] });
          if (result?.transcript) onTranscriptRef.current(result.transcript);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setTranscribing(false);
          setRecording(false);
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access denied");
      setRecording(false);
      cleanup();
    }
  }, [transcribe, cleanup]);

  const stop = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      try { mr.stop(); } catch { /* noop */ }
    } else {
      setRecording(false);
      cleanup();
    }
  }, [cleanup]);

  return { recording, transcribing, error, start, stop };
}
