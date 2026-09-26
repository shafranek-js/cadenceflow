import { describe, expect, it } from "vitest";
import { canonicalSampleMapBytes } from "../../../scripts/lib/canonicalSampleMapBytes";

describe("canonicalSampleMapBytes", () => {
  it("returns canonical LF bytes without copying", () => {
    const bytes = Buffer.from("a\nb\n", "utf8");

    expect(canonicalSampleMapBytes(bytes)).toBe(bytes);
  });

  it("converts an exact CRLF checkout form to canonical LF bytes", () => {
    const bytes = Buffer.from("a\r\nb\r\n", "utf8");

    expect(canonicalSampleMapBytes(bytes)).toEqual(Buffer.from("a\nb\n", "utf8"));
  });

  it("rejects mixed LF and CRLF line endings", () => {
    expect(() => canonicalSampleMapBytes(Buffer.from("a\r\nb\n", "utf8"))).toThrow(
      "mixes LF and CRLF",
    );
  });

  it("rejects a standalone carriage return", () => {
    expect(() => canonicalSampleMapBytes(Buffer.from([0x61, 0x0d, 0x62]))).toThrow(
      "unsupported carriage return",
    );
  });

  it("preserves arbitrary binary bytes while normalizing CRLF", () => {
    const bytes = Buffer.from([0xff, 0x00, 0x61, 0x0d, 0x0a, 0xfe]);

    expect(canonicalSampleMapBytes(bytes)).toEqual(Buffer.from([0xff, 0x00, 0x61, 0x0a, 0xfe]));
  });
});
