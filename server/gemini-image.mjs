/**
 * Every AI-made image goes through Google Gemini "Nano Banana 2" (gemini-3.1-flash-image).
 *
 * When an existing image is being changed, that image is sent along as a reference, so the
 * model edits it (same subject, framing and style) instead of inventing a new picture.
 * The key is GEMINI_API_KEY in the project's .env.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 180000;
const RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const MAX_REFERENCE_BYTES = 7 * 1024 * 1024;

export function loadGeminiKey() {
  const clean = (v) => String(v || '').trim().replace(/^["']|["']$/g, '');
  if (clean(process.env.GEMINI_API_KEY)) return clean(process.env.GEMINI_API_KEY);
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return '';
  const line = fs.readFileSync(envPath, 'utf8').split('\n').find((l) => l.startsWith('GEMINI_API_KEY='));
  return line ? clean(line.slice('GEMINI_API_KEY='.length)) : '';
}

/** The supported aspect ratio closest to "1536x1024" / {width, height}. */
export function aspectRatioFor(size) {
  let w = 1;
  let h = 1;
  if (typeof size === 'string' && /^\d+x\d+$/.test(size)) [w, h] = size.split('x').map(Number);
  else if (size?.width && size?.height) ({ width: w, height: h } = size);
  const want = Math.log(w / h);
  return RATIOS.reduce((best, r) => {
    const [a, b] = r.split(':').map(Number);
    return Math.abs(Math.log(a / b) - want) < Math.abs(Math.log(best.split(':')[0] / best.split(':')[1]) - want) ? r : best;
  }, '1:1');
}

/** A reference image from a file on disk (null when it isn't a usable raster image). */
export function referenceFromFile(file) {
  try {
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime || !fs.statSync(file).isFile()) return null;
    const data = fs.readFileSync(file);
    return data.length && data.length <= MAX_REFERENCE_BYTES ? { data, mime } : null;
  } catch {
    return null;
  }
}

/** A reference from a "data:image/png;base64,..." URL (e.g. a screenshot an admin attached). */
export function referenceFromDataUrl(url) {
  const m = String(url || '').match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s);
  if (!m) return null;
  const data = Buffer.from(m[2], 'base64');
  return data.length <= MAX_REFERENCE_BYTES ? { data, mime: m[1] } : null;
}

async function callGemini(apiKey, body) {
  const res = await fetch(`${API}/${GEMINI_IMAGE_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Gemini image generation failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const parts = data.candidates?.[0]?.content?.parts || [];
  const image = parts.find((p) => (p.inlineData || p.inline_data)?.data);
  if (!image) {
    const said = parts.map((p) => p.text).filter(Boolean).join(' ').slice(0, 200);
    const blocked = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason;
    throw new Error(`Gemini returned no image${blocked && blocked !== 'STOP' ? ` (${blocked})` : ''}${said ? `: ${said}` : '.'}`);
  }
  const inline = image.inlineData || image.inline_data;
  const mime = inline.mimeType || inline.mime_type || 'image/png';
  return { buffer: Buffer.from(inline.data, 'base64'), mime, ext: EXT[mime] || '.png' };
}

/**
 * Make an image with Nano Banana 2.
 *  prompt      what to draw (or, with references, how to change the reference)
 *  size        "WxH" or {width, height}: only its shape matters (mapped to an aspect ratio)
 *  references  [{data: Buffer, mime}] — the current image first when editing it
 * Returns { buffer, mime, ext }.
 */
export async function generateImage(prompt, { size = '1024x1024', references = [], imageSize = '1K' } = {}) {
  const apiKey = loadGeminiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in .env.');
  const refs = references.filter(Boolean).slice(0, 4);
  const text = refs.length
    ? `${String(prompt).slice(0, 1500)}\n\nUse the attached image${refs.length > 1 ? 's' : ''} as the reference: the first one is the image currently on the web page. Keep its composition, framing and style unless the request says otherwise. Return one finished image.`
    : String(prompt).slice(0, 1500);
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text },
        ...refs.map((r) => ({ inlineData: { mimeType: r.mime, data: r.data.toString('base64') } })),
      ],
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: aspectRatioFor(size), imageSize },
    },
  };
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await callGemini(apiKey, body);
    } catch (err) {
      lastError = err;
      // Busy or temporary server errors usually pass on a retry; anything else won't.
      if (!(err.status === 429 || err.status >= 500 || /timeout|overloaded|unavailable/i.test(err.message))) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  throw lastError;
}
