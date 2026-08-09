import jsQR from 'jsqr';

const MAX_DECODE_DIMENSION = 1024;

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('read-failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image-load-failed'));
    img.src = src;
  });
}

function drawImageToCanvas(img) {
  const scale = Math.min(1, MAX_DECODE_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/** Decodes a QR code from an image File. Resolves with the raw string or null when no QR found. */
export async function decodeQrFromFile(file) {
  if (!file || typeof file !== 'object') return null;
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);
  const imageData = drawImageToCanvas(img);
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert',
  });
  return result ? result.data : null;
}
