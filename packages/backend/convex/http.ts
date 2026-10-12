import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { AI_INPUT_LIMITS } from "./ai_guard";

const http = httpRouter();

/** Stores and registers a photo for the authenticated uploader, deleting it if registration fails. */
export const uploadPhoto = httpAction(async (ctx, request) => {
  if ((await ctx.auth.getUserIdentity()) === null) return new Response("Unauthenticated", { status: 401 });
  const photo = await request.blob();
  if (!photo.type.startsWith("image/")) return new Response("That file is not an image.", { status: 400 });
  if (photo.size > AI_INPUT_LIMITS.imageBytes) return new Response("Photo is too large.", { status: 413 });
  const storageId = await ctx.storage.store(photo);
  try {
    await ctx.runMutation(internal.uploads.registerStoredUpload, { storageId });
  } catch (error) {
    await ctx.storage.delete(storageId);
    return new Response(error instanceof Error ? error.message : "Upload failed. Try again.", { status: 409 });
  }
  return Response.json({ storageId });
});

http.route({ path: "/upload", method: "POST", handler: uploadPhoto });
export default http;
