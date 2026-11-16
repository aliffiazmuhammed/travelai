/**
 * Minimal UTF-8 decoder. SSE frames are split on `\n`, which never appears
 * inside a multi-byte sequence, so whole lines decode cleanly without the
 * environment-dependent `TextDecoder`.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  let out = '';
  let index = 0;

  while (index < bytes.length) {
    const lead = bytes[index++];

    if (lead < 0x80) {
      out += String.fromCharCode(lead);
      continue;
    }

    if (lead >= 0xc2 && lead < 0xe0) {
      const next = bytes[index++];
      out += String.fromCharCode(((lead & 0x1f) << 6) | (next & 0x3f));
      continue;
    }

    if (lead >= 0xe0 && lead < 0xf0) {
      const second = bytes[index++];
      const third = bytes[index++];
      out += String.fromCharCode(
        ((lead & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f)
      );
      continue;
    }

    if (lead >= 0xf0) {
      const second = bytes[index++];
      const third = bytes[index++];
      const fourth = bytes[index++];
      let codePoint =
        ((lead & 0x07) << 18) |
        ((second & 0x3f) << 12) |
        ((third & 0x3f) << 6) |
        (fourth & 0x3f);
      codePoint -= 0x10000;
      out += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff));
      continue;
    }

    out += '\uFFFD';
  }

  return out;
}
