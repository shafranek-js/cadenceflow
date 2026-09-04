/**
 * CadenceFlow HQ piano-bank preparation contract.
 *
 * Input: a separately obtained, correctly licensed multisample source bank.
 * Output: web-encoded samples + manifest + attribution file.
 *
 * This script intentionally does not vendor or download third-party recordings.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputRoot = resolve("public/audio/piano-hq");
await mkdir(resolve(outputRoot, "samples"), { recursive: true });

const manifest = {
  schemaVersion: 1,
  instrumentId: "piano-hq",
  displayName: "CadenceFlow HQ Piano",
  sampleFormat: "pending-preparation",
  regions: [],
};

await writeFile(resolve(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Created piano manifest scaffold at ${resolve(outputRoot, "manifest.json")}`);
