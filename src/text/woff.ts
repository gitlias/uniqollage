// Minimal WOFF 1.0 → SFNT (TrueType/OpenType) converter. HarfBuzz reads only
// SFNT, while the bundled Fontsource files are WOFF. Tables are zlib-compressed
// individually; DecompressionStream('deflate') handles the zlib format.

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(data as BodyInit).body!.pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function woffToSfnt(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const v = new DataView(buf);
  if (v.getUint32(0) !== 0x774f4646) return buf; // not WOFF ("wOFF") – assume SFNT already
  const flavor = v.getUint32(4);
  const numTables = v.getUint16(12);
  const tables: { tag: number; checksum: number; data: Uint8Array }[] = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = v.getUint32(o);
    const offset = v.getUint32(o + 4);
    const compLength = v.getUint32(o + 8);
    const origLength = v.getUint32(o + 12);
    const checksum = v.getUint32(o + 16);
    const raw = new Uint8Array(buf, offset, compLength);
    tables.push({ tag, checksum, data: compLength < origLength ? await inflate(raw) : raw });
  }
  // SFNT header + table directory, then 4-byte aligned table data.
  let searchRange = 1;
  let entrySelector = 0;
  while (searchRange * 2 <= numTables) {
    searchRange *= 2;
    entrySelector++;
  }
  searchRange *= 16;
  const headerSize = 12 + numTables * 16;
  let size = headerSize;
  for (const t of tables) size += (t.data.length + 3) & ~3;
  const out = new Uint8Array(size);
  const o = new DataView(out.buffer);
  o.setUint32(0, flavor);
  o.setUint16(4, numTables);
  o.setUint16(6, searchRange);
  o.setUint16(8, entrySelector);
  o.setUint16(10, numTables * 16 - searchRange);
  let offset = headerSize;
  tables.forEach((t, i) => {
    const d = 12 + i * 16;
    o.setUint32(d, t.tag);
    o.setUint32(d + 4, t.checksum);
    o.setUint32(d + 8, offset);
    o.setUint32(d + 12, t.data.length);
    out.set(t.data, offset);
    offset += (t.data.length + 3) & ~3;
  });
  return out.buffer;
}
