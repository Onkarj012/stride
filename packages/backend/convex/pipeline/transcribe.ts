import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { assertAudioBase64, estimateTranscriptionCostUsd } from "../ai_guard";

/** Transcribes base64 audio with Groq Whisper under the user's AI budget. Shared by chat turns and the log pipeline. */
export async function transcribeAudio(
  ctx: ActionCtx,
  userId: string,
  audio: string,
  mimeType: string | undefined,
): Promise<string> {
  assertAudioBase64(audio);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set in Convex environment");

  const mime = mimeType || "audio/webm";
  const ext = mime === "audio/mp4" ? "mp4" : mime === "audio/wav" ? "wav" : "webm";

  const binary = atob(audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const transcriptionCostUsd = estimateTranscriptionCostUsd(bytes.byteLength);
  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: mime }), `audio.${ext}`);
  formData.append("model", "whisper-large-v3-turbo");

  const reservation = await ctx.runMutation(internal.ai_guard.checkAndReserve, {
    userId,
    model: "groq/whisper-large-v3-turbo",
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    estimatedCostUsd: transcriptionCostUsd,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Groq transcription error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json() as { text?: string; error?: { message?: string } };
    if (data.error || !data.text) {
      throw new Error(data.error ? `Groq error: ${data.error.message}` : "Groq returned empty transcription");
    }
    await ctx.runMutation(internal.ai_guard.settleUsage, {
      reservationId: reservation.reservationId,
      inputTokens: 0,
      outputTokens: 0,
      actualCostUsd: transcriptionCostUsd,
    });
    return data.text.trim();
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error("Groq transcription timed out after 30s");
    throw err;
  } finally {
    clearTimeout(timeout);
    // Fetch may have reached Groq even when its response or settlement failed; retain the reserve.
  }
}
