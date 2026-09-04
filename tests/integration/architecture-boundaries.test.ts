import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const forbidden = ["react", "vexflow", "spessasynth", "AudioContext", "indexedDB", "dexie"];

describe("domain architecture boundary", () => {
  it("keeps src/domain free of UI/audio/persistence dependencies", async () => {
    const root = resolve("src/domain");
    const names = (await readdir(root, { recursive: true })).filter((name) => name.endsWith(".ts"));
    for (const name of names) {
      const source = await readFile(resolve(root, name), "utf8");
      for (const token of forbidden) expect(source.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });
});
