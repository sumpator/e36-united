export const PHOTO_INPUT_MAX_BYTES = 50 * 1024 * 1024;
export const PHOTO_OUTPUT_MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_MAX_PIXELS = 80_000_000;
export const PHOTO_MAX_EDGE = 16_384;

// Read bounded metadata before a browser decodes the original, including thumbnails.
export async function validatePhotoInput(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file?.type))
    throw new Error('Podporujeme JPG, PNG a WebP. HEIC nejdřív ulož jako JPG.');
  if (!file.size || file.size > PHOTO_INPUT_MAX_BYTES)
    throw new Error('Vstupní fotografie musí mít 1 B až 50 MiB.');
  const bytes = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  const view = new DataView(bytes.buffer);
  const ascii = (offset, length) => String.fromCharCode(...bytes.slice(offset, offset + length));
  let width = 0, height = 0;
  if (file.type === 'image/png' && bytes.length >= 24 && ascii(1, 3) === 'PNG' && bytes[0] === 137 && ascii(12, 4) === 'IHDR') {
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (file.type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    for (let offset = 2; offset + 4 <= bytes.length;) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 8) {
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += length;
    }
  } else if (file.type === 'image/webp' && bytes.length >= 30 && ascii(0,4) === 'RIFF' && ascii(8,4) === 'WEBP') {
    const kind = ascii(12,4);
    if (kind === 'VP8X') {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
    } else if (kind === 'VP8L' && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      width = 1 + (bits & 0x3fff); height = 1 + ((bits >>> 14) & 0x3fff);
    }
  }
  if (!width || !height) throw new Error('Nelze bezpečně přečíst rozměry fotografie. Ulož ji znovu jako JPG.');
  if (width > PHOTO_MAX_EDGE || height > PHOTO_MAX_EDGE || width * height > PHOTO_MAX_PIXELS)
    throw new Error('Fotografie přesahuje bezpečný limit 80 megapixelů nebo 16 384 px na stranu. Nejdřív ji zmenši.');
  return { width, height };
}
