import subsetFont from 'subset-font';
import fontverter from 'fontverter';
import { readFileSync, writeFileSync } from 'fs';

// Step 1: Read original WOFF2 and convert to TTF
const woff2 = readFileSync('./fonts/tabler-icons/fonts/tabler-icons.woff2');
console.log(`Original WOFF2: ${(woff2.length / 1024).toFixed(1)} KB`);

const ttfRaw = await fontverter.convert(woff2, 'truetype');
const ttfFull = Buffer.from(ttfRaw);
console.log(`Converted TTF:  ${(ttfFull.length / 1024).toFixed(1)} KB`);

// Step 2: Strip GSUB table (fontverter produces a corrupt GSUB that breaks harfbuzz)
function stripTable(buf, tagToRemove) {
  const numTables = buf.readUInt16BE(4);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    const tag = buf.slice(off, off + 4).toString('ascii');
    if (tag === tagToRemove) continue;
    tables.push({
      tag,
      checksum: buf.readUInt32BE(off + 4),
      srcOff:   buf.readUInt32BE(off + 8),
      length:   buf.readUInt32BE(off + 12),
    });
  }
  const n = tables.length;
  const headerSize = 12 + n * 16;
  const sorted = tables.slice().sort((a, b) => a.srcOff - b.srcOff);
  let offset = headerSize;
  const newOffsets = {};
  for (const t of sorted) { newOffsets[t.tag] = offset; offset += (t.length + 3) & ~3; }
  const out = Buffer.alloc(offset, 0);
  out.writeUInt32BE(0x00010000, 0);
  out.writeUInt16BE(n, 4);
  const sr = Math.pow(2, Math.floor(Math.log2(n))) * 16;
  out.writeUInt16BE(sr, 6);
  out.writeUInt16BE(Math.floor(Math.log2(n)), 8);
  out.writeUInt16BE(n * 16 - sr, 10);
  const byTag = tables.slice().sort((a, b) => a.tag.localeCompare(b.tag));
  for (let i = 0; i < n; i++) {
    const t = byTag[i];
    const base = 12 + i * 16;
    out.write(t.tag, base, 'ascii');
    out.writeUInt32BE(t.checksum, base + 4);
    out.writeUInt32BE(newOffsets[t.tag], base + 8);
    out.writeUInt32BE(t.length, base + 12);
    buf.copy(out, newOffsets[t.tag], t.srcOff, t.srcOff + t.length);
  }
  return out;
}
const ttf = stripTable(ttfFull, 'GSUB');
console.log(`TTF sans GSUB:  ${(ttf.length / 1024).toFixed(1)} KB`);

// Step 3: Subset to only the 30 codepoints used by SITEMAP
const codepoints = [
  0xea06, // alert-triangle
  0xea4f, // building
  0xf830, // calendar-star
  0xea54, // camera
  0xec3c, // capture
  0xea5e, // check
  0xeba6, // checkbox
  0xea5f, // chevron-down
  0xea61, // chevron-right
  0xea67, // circle-check
  0xea82, // corner-up-left
  0xee6d, // cursor-text
  0xeb62, // device-floppy
  0xef4d, // door-exit
  0xecf0, // eye-off
  0xede9, // file-export
  0xfb10, // file-type-pdf
  0xee8d, // flag-3
  0xfaf7, // folder-open
  0xeac5, // info-circle
  0xeacf, // layout-align-left
  0xeb6a, // list-check
  0xf226, // loader-2
  0xeae9, // map
  0xeae7, // map-2
  0xeae8, // map-pin
  0xeed2, // ruler-2
  0xec9e, // select
  0xeb22, // shield-check
  0xeb41, // trash
];
const text = codepoints.map(cp => String.fromCodePoint(cp)).join('');

const subset = await subsetFont(ttf, text, { targetFormat: 'woff2' });
writeFileSync('./fonts/tabler-icons/fonts/tabler-icons.subset.woff2', subset);

const newKB  = (subset.length / 1024).toFixed(1);
const pct    = (100 * (woff2.length - subset.length) / woff2.length).toFixed(1);
console.log(`Subset WOFF2:   ${newKB} KB  (${pct}% smaller, ${codepoints.length} glyphs)`);
