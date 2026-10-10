import { Inflate } from "fflate";
import { MAX_XML_BYTES, parseMusicXml, parseSafeXml, type ImportedScore } from "./scoreFile";

const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function error(message: string): never {
  throw new Error(`Invalid compressed MusicXML: ${message}`);
}
function safePath(path: string): boolean {
  return (
    Boolean(path) &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.includes(":") &&
    !path.includes("\0") &&
    !path.split("/").some((segment) => segment === ".." || segment === "." || segment === "")
  );
}
interface ZipEntry {
  name: string;
  method: number;
  compressed: number;
  original: number;
  crc: number;
  offset: number;
}

/** Reads only the container and its score. Inflater input is chunked so forged sizes
 * cannot force a single unbounded output allocation before the actual-byte cap. */
export function parseMxl(bytes: Uint8Array): ImportedScore {
  if (bytes.length > MAX_ARCHIVE_BYTES) error("archive exceeds 10 MB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => {
    if (offset < 0 || offset + 2 > bytes.length) error("truncated ZIP header.");
    return view.getUint16(offset, true);
  };
  const u32 = (offset: number) => {
    if (offset < 0 || offset + 4 > bytes.length) error("truncated ZIP header.");
    return view.getUint32(offset, true);
  };
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--)
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === bytes.length) {
      eocd = offset;
      break;
    }
  if (eocd < 0) error("ZIP directory is missing.");
  const count = u16(eocd + 10),
    directorySize = u32(eocd + 12),
    directoryOffset = u32(eocd + 16);
  if (
    u16(eocd + 4) ||
    u16(eocd + 6) ||
    u16(eocd + 8) !== count ||
    count === 65535 ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  )
    error("multipart and ZIP64 archives are not supported.");
  if (!count || count > 256 || directoryOffset + directorySize !== eocd)
    error("unsupported ZIP directory size.");
  const entries = new Map<string, ZipEntry>();
  let cursor = directoryOffset,
    expanded = 0;
  for (let index = 0; index < count; index++) {
    if (u32(cursor) !== 0x02014b50) error("corrupt ZIP directory.");
    const flags = u16(cursor + 8),
      method = u16(cursor + 10),
      compressed = u32(cursor + 20),
      original = u32(cursor + 24),
      nameLength = u16(cursor + 28),
      extraLength = u16(cursor + 30),
      commentLength = u16(cursor + 32),
      offset = u32(cursor + 42);
    if (flags & 1 || flags & 64) error("encrypted archives are not supported.");
    if (method !== 0 && method !== 8) error("unsupported compression method.");
    if (
      compressed === 0xffffffff ||
      original === 0xffffffff ||
      offset === 0xffffffff ||
      u16(cursor + 34)
    )
      error("ZIP64 and multipart entries are not supported.");
    if (cursor + 46 + nameLength + extraLength + commentLength > eocd)
      error("truncated ZIP directory entry.");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    const normalized = name.endsWith("/") ? name.slice(0, -1) : name;
    if (!safePath(normalized) || entries.has(name)) error("unsafe or duplicate archive path.");
    expanded += original;
    if (expanded > MAX_EXPANDED_BYTES) error("expanded archive exceeds 50 MB.");
    entries.set(name, { name, method, compressed, original, crc: u32(cursor + 16), offset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== eocd) error("ZIP directory length mismatch.");
  let actualExpanded = 0;
  const extract = (name: string): string => {
    const entry = entries.get(name);
    if (!entry) error(`missing ${name === "META-INF/container.xml" ? "container" : "root score"}.`);
    if (entry.original > MAX_XML_BYTES) error("XML entry exceeds 10 MB.");
    const local = entry.offset;
    if (u32(local) !== 0x04034b50 || u16(local + 8) !== entry.method || u16(local + 6) & 1)
      error("corrupt local ZIP header.");
    const nameLength = u16(local + 26),
      extraLength = u16(local + 28),
      start = local + 30 + nameLength + extraLength;
    if (
      new TextDecoder().decode(bytes.subarray(local + 30, local + 30 + nameLength)) !==
        entry.name ||
      start + entry.compressed > directoryOffset
    )
      error("ZIP entry path or length mismatch.");
    const chunks: Uint8Array[] = [];
    let size = 0,
      crc = 0xffffffff;
    const append = (chunk: Uint8Array) => {
      size += chunk.length;
      actualExpanded += chunk.length;
      if (size > MAX_XML_BYTES || actualExpanded > MAX_EXPANDED_BYTES || size > entry.original)
        error("decompressed output exceeds its supported limit.");
      for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
      chunks.push(chunk.slice());
    };
    const compressed = bytes.subarray(start, start + entry.compressed);
    if (entry.method === 0) append(compressed);
    else {
      const inflater = new Inflate((chunk) => append(chunk));
      for (let offset = 0; offset < compressed.length; offset += 256)
        inflater.push(compressed.subarray(offset, offset + 256), offset + 256 >= compressed.length);
      if (!compressed.length) error("empty deflate stream.");
    }
    if (size !== entry.original || (crc ^ 0xffffffff) >>> 0 !== entry.crc)
      error("ZIP entry length or checksum mismatch.");
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  };
  const container = parseSafeXml(extract("META-INF/container.xml"));
  if (container.documentElement.localName !== "container") error("invalid container document.");
  const rootfile = Array.from(container.getElementsByTagNameNS("*", "rootfile")).find(
    (entry) => entry.getAttribute("media-type") === "application/vnd.recordare.musicxml+xml",
  );
  const path = rootfile?.getAttribute("full-path");
  if (!path || !safePath(path)) error("container has no supported root score.");
  return parseMusicXml(extract(path));
}
