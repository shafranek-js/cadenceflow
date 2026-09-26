/** Return canonical LF bytes from a sample map in LF or exact CRLF form. */
export function canonicalSampleMapBytes(bytes: Buffer): Buffer {
  let carriageReturnIndex = bytes.indexOf(0x0d);
  if (carriageReturnIndex === -1) return bytes;

  const carriageReturns: number[] = [];
  while (carriageReturnIndex !== -1) {
    if (bytes[carriageReturnIndex + 1] !== 0x0a) {
      throw new Error("Sample map contains an unsupported carriage return");
    }
    carriageReturns.push(carriageReturnIndex);
    carriageReturnIndex = bytes.indexOf(0x0d, carriageReturnIndex + 1);
  }

  let lineFeedIndex = bytes.indexOf(0x0a);
  while (lineFeedIndex !== -1) {
    if (bytes[lineFeedIndex - 1] !== 0x0d) {
      throw new Error("Sample map mixes LF and CRLF line endings");
    }
    lineFeedIndex = bytes.indexOf(0x0a, lineFeedIndex + 1);
  }

  const canonical = Buffer.allocUnsafe(bytes.length - carriageReturns.length);
  let sourceOffset = 0;
  let targetOffset = 0;
  for (const index of carriageReturns) {
    const copied = bytes.copy(canonical, targetOffset, sourceOffset, index);
    targetOffset += copied;
    sourceOffset = index + 1;
  }
  bytes.copy(canonical, targetOffset, sourceOffset);
  return canonical;
}
