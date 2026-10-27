import { readFileSync } from 'node:fs';
import { fontFiles, installFonts, fontsReady } from '../src/text/fonts';

export function setupFonts(): void {
  if (fontsReady()) return;
  const buffers = new Map<string, ArrayBuffer>();
  for (const { path } of fontFiles()) {
    const b = readFileSync(`node_modules/@fontsource/${path}`);
    buffers.set(path, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  }
  installFonts(buffers);
}
