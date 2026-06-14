// compress-to-size — hit an exact image file-size target, in the browser.
//
// This is the encoding core behind ImageConverterTool's "compress to an exact
// KB" tools (https://imageconvertertool.com/compress-image/). Everything runs on
// a <canvas>; no bytes ever leave the page.

const MIME = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * Binary-search an encoder's quality parameter to land at or below `targetBytes`.
 *
 * `renderAtQuality(q)` receives a quality in [0, 1] and returns a `Promise<Blob|null>`.
 * This core is deliberately environment-free — no DOM, no canvas — so the search
 * itself is trivially unit-testable. (It is exactly the loop the tools use.)
 *
 * @param {(q: number) => Promise<{ size: number } | null>} renderAtQuality
 * @param {number} targetBytes  Desired maximum size, in bytes.
 * @param {{ minQ?: number, maxQ?: number, iterations?: number }} [options]
 * @returns {Promise<Blob|null>} The largest blob that still fits, or the smallest possible.
 */
export async function compressToTargetBytes(renderAtQuality, targetBytes, options = {}) {
  const { minQ = 0.2, maxQ = 0.95, iterations = 7 } = options;
  if (!(targetBytes > 0)) return renderAtQuality(maxQ);

  // If best quality already fits, we're done — never degrade needlessly.
  const top = await renderAtQuality(maxQ);
  if (top && top.size <= targetBytes) return top;

  let low = minQ;
  let high = maxQ;
  let best = null;
  for (let i = 0; i < iterations; i++) {
    const q = (low + high) / 2;
    const blob = await renderAtQuality(q);
    if (!blob) break;
    if (blob.size > targetBytes) {
      high = q; // too big — lower the quality ceiling
    } else {
      best = blob; // fits — remember it, push for higher quality
      low = q;
    }
  }
  return best || renderAtQuality(minQ);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob() returned null'))),
      type,
      quality,
    );
  });
}

async function loadDrawable(source) {
  // Prefer createImageBitmap (decodes off the main thread where supported).
  if (source instanceof Blob && typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(source);
    } catch {
      /* fall through to HTMLImageElement */
    }
  }
  const url = source instanceof Blob ? URL.createObjectURL(source) : source;
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = url;
    });
  } finally {
    if (source instanceof Blob) URL.revokeObjectURL(url);
  }
}

/**
 * Compress an image (`File`/`Blob`) to at or below `targetBytes`, entirely client-side.
 *
 * Strategy mirrors the production tools: binary-search the encoder quality first; if
 * the smallest acceptable quality still overshoots, progressively downscale the
 * dimensions and search again. Returns the smallest blob found (or `null` if the
 * source could not be drawn). Nothing is ever uploaded.
 *
 * @param {Blob|File|string} source       Image blob/file, or an image URL/data-URL.
 * @param {number} targetBytes            Desired maximum size, in bytes (e.g. 50 * 1024).
 * @param {object} [options]
 * @param {'image/jpeg'|'image/webp'|'jpeg'|'webp'} [options.type='image/jpeg'] Output format.
 * @param {number} [options.minQ=0.2]     Lowest quality the search will try.
 * @param {number} [options.maxQ=0.95]    Highest quality the search will try.
 * @param {number} [options.iterations=7] Binary-search steps per dimension.
 * @param {number} [options.minDimension=64]  Stop downscaling below this width/height.
 * @param {number} [options.downscaleStep=0.85] Multiplier applied each downscale pass.
 * @param {number} [options.maxDownscales=8] Cap on downscale passes.
 * @param {string} [options.background='#ffffff'] Matte for JPEG (which has no alpha).
 * @returns {Promise<Blob|null>}
 */
export async function compressImageToSize(source, targetBytes, options = {}) {
  const {
    type = 'image/jpeg',
    minQ = 0.2,
    maxQ = 0.95,
    iterations = 7,
    minDimension = 64,
    downscaleStep = 0.85,
    maxDownscales = 8,
    background = '#ffffff',
  } = options;

  if (!(targetBytes > 0)) throw new TypeError('targetBytes must be a positive number');
  const outType = MIME[type] || type;

  const drawable = await loadDrawable(source);
  let width = drawable.width || drawable.naturalWidth;
  let height = drawable.height || drawable.naturalHeight;
  if (!width || !height) throw new Error('Image has no intrinsic dimensions');

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const renderAtDimensions = (w, h) => {
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (outType === 'image/jpeg') {
      ctx.fillStyle = background; // JPEG can't store transparency
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  };

  let best = null;
  for (let pass = 0; pass <= maxDownscales; pass++) {
    renderAtDimensions(width, height);
    const blob = await compressToTargetBytes(
      (q) => canvasToBlob(canvas, outType, q),
      targetBytes,
      { minQ, maxQ, iterations },
    );
    if (blob && (!best || blob.size < best.size)) best = blob;
    if (best && best.size <= targetBytes) break; // target reached
    width *= downscaleStep;
    height *= downscaleStep;
    if (width < minDimension || height < minDimension) break;
  }

  if (typeof drawable.close === 'function') drawable.close();
  return best;
}

export default compressImageToSize;
