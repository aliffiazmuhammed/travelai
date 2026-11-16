/**
 * Minimal UTF-8 codec. SSE frames are split on `\n`, which never appears
 * inside a multi-byte sequence, so whole lines decode cleanly without the
 * environment-dependent `TextDecoder`; the encoder exists for the same reason
 * on Hermes, where `TextEncoder` is not guaranteed.
 */
export function encodeUtf8(text: string): Uint8Array {
  const out: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    let code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return new Uint8Array(out);
}

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
