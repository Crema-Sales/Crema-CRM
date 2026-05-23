// Downscale a user-pasted/dropped image before persisting to localStorage.
// localStorage quota is ~5MB total per origin, so we cap the long edge to
// keep multi-image chats viable. Once the RepAgent DO is wired, attachments
// will upload to R2 and this becomes obsolete.

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;

export async function fileToDataUrl(file: File, opts: { maxEdge?: number; quality?: number } = {}): Promise<{
  dataUrl: string;
  mime: string;
}> {
  const maxEdge = opts.maxEdge ?? MAX_EDGE;
  const quality = opts.quality ?? JPEG_QUALITY;
  if (!file.type.startsWith("image/")) {
    return { dataUrl: await readAsDataUrl(file), mime: file.type || "application/octet-stream" };
  }
  const bitmap = await loadBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { dataUrl: await readAsDataUrl(file), mime: file.type };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  // PNG keeps transparency; JPEG is far smaller for photos.
  const outMime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const dataUrl = canvas.toDataURL(outMime, quality);
  return { dataUrl, mime: outMime };
}

function fitWithin(w: number, h: number, maxEdge: number): { width: number; height: number } {
  if (w <= maxEdge && h <= maxEdge) return { width: w, height: h };
  if (w >= h) {
    return { width: maxEdge, height: Math.round((h * maxEdge) / w) };
  }
  return { width: Math.round((w * maxEdge) / h), height: maxEdge };
}

async function loadBitmap(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not decode image"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error ?? new Error("read failed"));
    fr.readAsDataURL(file);
  });
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE);
  if (!matches) return [];
  return Array.from(new Set(matches.map((u) => u.replace(/[.,;:!?)\]]+$/, ""))));
}
