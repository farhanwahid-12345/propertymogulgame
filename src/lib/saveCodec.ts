import LZString from 'lz-string';

/** Prefix marking a compressed save. Legacy saves are plain JSON and start with "{". */
export const COMPRESSED_PREFIX = 'lz1:';

export function encodeSave(json: string): string {
  try {
    return COMPRESSED_PREFIX + LZString.compressToUTF16(json);
  } catch {
    return json;
  }
}

/** Returns the JSON string for a stored save, transparently handling legacy uncompressed saves. */
export function decodeSave(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith(COMPRESSED_PREFIX)) return raw;
  try {
    return LZString.decompressFromUTF16(raw.slice(COMPRESSED_PREFIX.length)) || null;
  } catch {
    return null;
  }
}
