# compress-to-size

[![npm version](https://img.shields.io/npm/v/compress-to-size.svg)](https://www.npmjs.com/package/compress-to-size)
[![license](https://img.shields.io/npm/l/compress-to-size.svg)](./LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)

**Compress an image to an exact file-size target — `50 KB`, `200 KB`, whatever you need — entirely in the browser.** No uploads, no server, no dependencies. It's the encoding core behind the exact-size tools at **[ImageConverterTool](https://imageconvertertool.com/compress-image/)**, extracted into a tiny standalone library.

Most compressors let you pick a *quality* and hope the size lands somewhere useful. This does the opposite: you give it a **size**, and it binary-searches the encoder quality (and downscales if needed) to hit it — the thing you actually want when a form says "photo must be under 50 KB."

## Why

Passport portals, visa applications, government exam forms (SSC/UPSC/PAN), and email attachments all enforce hard KB limits. Picking quality sliders by trial and error is miserable. `compress-to-size` turns "get this under N KB" into one call — and because it runs on a `<canvas>`, the image never leaves the user's device.

## Install

```bash
npm install compress-to-size
```

Or use it straight from a CDN, no build step:

```js
import { compressImageToSize } from 'https://esm.sh/compress-to-size';
```

## Usage

```js
import { compressImageToSize } from 'compress-to-size';

const fileInput = document.querySelector('input[type=file]');

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];

  // Squeeze it to 50 KB or less, as a JPEG:
  const blob = await compressImageToSize(file, 50 * 1024);

  console.log(`${(file.size / 1024).toFixed(0)} KB → ${(blob.size / 1024).toFixed(0)} KB`);

  // Download it, preview it, hand it to a <form> — your call:
  const url = URL.createObjectURL(blob);
  document.querySelector('img#preview').src = url;
});
```

WebP usually goes smaller at the same visual quality:

```js
const blob = await compressImageToSize(file, 100 * 1024, { type: 'image/webp' });
```

## API

### `compressImageToSize(source, targetBytes, options?) → Promise<Blob|null>`

Compress a `File`, `Blob`, image URL, or data-URL to **at or below** `targetBytes`. Binary-searches encoder quality; if the lowest quality still overshoots, it progressively downscales and tries again. Returns the smallest blob it found, or `null` if the source couldn't be drawn.

| Option | Default | Meaning |
| --- | --- | --- |
| `type` | `'image/jpeg'` | Output format (`'image/jpeg'` or `'image/webp'`). |
| `minQ` | `0.2` | Lowest quality the search will try. |
| `maxQ` | `0.95` | Highest quality the search will try. |
| `iterations` | `7` | Binary-search steps per dimension. |
| `minDimension` | `64` | Stop downscaling below this width/height. |
| `downscaleStep` | `0.85` | Multiplier applied on each downscale pass. |
| `maxDownscales` | `8` | Cap on downscale passes. |
| `background` | `'#ffffff'` | Matte colour for JPEG (which has no alpha). |

### `compressToTargetBytes(renderAtQuality, targetBytes, options?) → Promise<Blob|null>`

The pure search core, with no DOM or canvas assumptions — useful if you already have your own renderer (a Web Worker, OffscreenCanvas, a WASM encoder, etc.). `renderAtQuality(q)` takes a quality in `[0, 1]` and returns a `Promise<Blob|null>`; the function returns the largest blob that still fits.

```js
import { compressToTargetBytes } from 'compress-to-size';

const blob = await compressToTargetBytes(
  (q) => myEncoder.encode(canvas, q), // your encoder, returns a Blob
  200 * 1024,
);
```

## How it works

1. Encode once at `maxQ`. If that already fits, return it — never degrade an image that's already small enough.
2. Otherwise binary-search quality between `minQ` and `maxQ` (`iterations` steps), keeping the highest quality that stays under target.
3. If even `minQ` overshoots, downscale the canvas by `downscaleStep` and repeat — until the target is met or `minDimension` is reached.

That's it. ~120 lines, zero dependencies, runs anywhere `<canvas>.toBlob()` exists.

## Tests

```bash
npm test   # node --test — pure search-core tests, no browser needed
```

## Related

A full, no-install version of this (plus convert, resize, crop, background removal, and more) lives at **[imageconvertertool.com](https://imageconvertertool.com)** — for example [compress to exactly 50 KB](https://imageconvertertool.com/compress-image-to-50kb/). Everything there runs in your browser too.

## License

[MIT](./LICENSE) © Avinash Verma
