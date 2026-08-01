/**
 * Client-side background remover.
 * Flood-fill from edges to detect background, then composites onto white.
 */

function colorDiff(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function removeBackground(file: File, tolerance = 38, feather = 2): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  let bgR = 0, bgG = 0, bgB = 0;
  for (const [cx, cy] of corners) {
    const idx = (cy * w + cx) * 4;
    bgR += data[idx]; bgG += data[idx + 1]; bgB += data[idx + 2];
  }
  bgR /= 4; bgG /= 4; bgB /= 4;

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) { stack.push(x); stack.push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(y * w + w - 1); }

  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const px = idx * 4;
    const r = data[px], g = data[px + 1], b = data[px + 2];
    if (colorDiff(r, g, b, bgR, bgG, bgB) < tolerance) {
      data[px + 3] = 0;
      const x = idx % w;
      const y = Math.floor(idx / w);
      if (x > 0) stack.push(idx - 1);
      if (x < w - 1) stack.push(idx + 1);
      if (y > 0) stack.push(idx - w);
      if (y < h - 1) stack.push(idx + w);
    }
  }

  if (feather > 0) {
    const copy = new Uint8ClampedArray(data);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (data[idx + 3] === 0) continue;
        let bgNeighbors = 0;
        for (let dy = -feather; dy <= feather; dy++) {
          for (let dx = -feather; dx <= feather; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            if (copy[(ny * w + nx) * 4 + 3] === 0) bgNeighbors++;
          }
        }
        if (bgNeighbors > 0) {
          const blend = Math.min(1, bgNeighbors / ((feather * 2 + 1) ** 2));
          data[idx] = Math.round(data[idx] * (1 - blend) + 255 * blend);
          data[idx + 1] = Math.round(data[idx + 1] * (1 - blend) + 255 * blend);
          data[idx + 2] = Math.round(data[idx + 2] * (1 - blend) + 255 * blend);
        }
      }
    }
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d')!;
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, w, h);

  const subjectCanvas = document.createElement('canvas');
  subjectCanvas.width = w;
  subjectCanvas.height = h;
  const subjectCtx = subjectCanvas.getContext('2d')!;
  subjectCtx.putImageData(imageData, 0, 0);
  outCtx.drawImage(subjectCanvas, 0, 0);

  const maxDim = 1200;
  let finalCanvas = outCanvas;
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    finalCanvas = document.createElement('canvas');
    finalCanvas.width = Math.round(w * scale);
    finalCanvas.height = Math.round(h * scale);
    const fctx = finalCanvas.getContext('2d')!;
    fctx.drawImage(outCanvas, 0, 0, finalCanvas.width, finalCanvas.height);
  }

  return new Promise((resolve, reject) => {
    finalCanvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to create blob'))),
      'image/jpeg',
      0.92,
    );
  });
}

function storageUrl(path?: string | null): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/products/${path}`;
}

export function getProductImageUrl(
  product: { image_path?: string | null; thumbnail_path?: string | null; images?: string[] },
  variant: 'thumbnail' | 'original' = 'thumbnail',
): string {
  if (variant === 'thumbnail' && product.thumbnail_path) {
    return storageUrl(product.thumbnail_path);
  }
  if (product.image_path) {
    if (/^https?:\/\//.test(product.image_path)) return product.image_path;
    return storageUrl(product.image_path);
  }
  if (product.images && product.images.length > 0) {
    const first = product.images[0];
    if (/^https?:\/\//.test(first)) return first;
    return storageUrl(first);
  }
  return 'https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg?auto=compress&cs=tinysrgb&w=600';
}
