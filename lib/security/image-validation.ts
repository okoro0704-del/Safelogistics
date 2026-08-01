/**
 * Basic image magic-byte validation for branding uploads.
 * Do not trust browser Content-Type alone.
 */

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46]; // RIFF....WEBP
const ICO = [0x00, 0x00, 0x01, 0x00];

function startsWith(buf: Buffer, sig: number[]) {
  if (buf.length < sig.length) return false;
  return sig.every((b, i) => buf[i] === b);
}

export type DetectedImageKind = "png" | "jpeg" | "webp" | "ico" | null;

export function detectImageKind(buffer: Buffer): DetectedImageKind {
  if (startsWith(buffer, PNG)) return "png";
  if (startsWith(buffer, JPEG)) return "jpeg";
  if (
    startsWith(buffer, WEBP_RIFF) &&
    bufIncludes(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }
  if (startsWith(buffer, ICO)) return "ico";
  return null;
}

function bufIncludes(buf: Buffer, sig: number[], at: number) {
  if (buf.length < at + sig.length) return false;
  return sig.every((b, i) => buf[at + i] === b);
}

export function mimeForImageKind(kind: DetectedImageKind): string | null {
  switch (kind) {
    case "png":
      return "image/png";
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "ico":
      return "image/x-icon";
    default:
      return null;
  }
}

export function extForImageKind(kind: DetectedImageKind): string | null {
  switch (kind) {
    case "png":
      return "png";
    case "jpeg":
      return "jpg";
    case "webp":
      return "webp";
    case "ico":
      return "ico";
    default:
      return null;
  }
}

/** Reject SVG / HTML / polyglot payloads labeled as images. */
export function assertSafeRasterImage(
  buffer: Buffer,
  allowed: Set<DetectedImageKind>,
): { kind: Exclude<DetectedImageKind, null>; mime: string; ext: string } {
  const kind = detectImageKind(buffer);
  if (!kind || !allowed.has(kind)) {
    throw new Error("Unsupported or invalid image file.");
  }
  // Extra guard: reject obvious XML/SVG even if somehow mis-detected
  const head = buffer.subarray(0, Math.min(256, buffer.length)).toString("utf8");
  if (/<\s*svg|<\s*html|<\s*script/i.test(head)) {
    throw new Error("Unsupported or invalid image file.");
  }
  return {
    kind,
    mime: mimeForImageKind(kind)!,
    ext: extForImageKind(kind)!,
  };
}
