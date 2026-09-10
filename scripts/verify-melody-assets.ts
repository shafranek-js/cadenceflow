import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicRoot = join(repositoryRoot, "public");
const manifestPath = join(publicRoot, "audio", "melody", "manifest.json");
const samplesRoot = join(publicRoot, "audio", "melody", "FluidR3_GM");
const expectedAssets = [
  "violin-mp3.js",
  "cello-mp3.js",
  "oboe-mp3.js",
  "clarinet-mp3.js",
  "flute-mp3.js",
  "lead_1_square-mp3.js",
] as const;

interface MelodyAssetRecord {
  readonly size: number;
  readonly sha256: string;
}

interface MelodyManifest {
  readonly schemaVersion: number;
  readonly sourceRepository: string;
  readonly sourceRevision: string;
  readonly license: string;
  readonly licenseFile: string;
  readonly attributionFile: string;
  readonly assets: Record<string, MelodyAssetRecord>;
}

async function readText(path: string, label: string): Promise<string> {
  const file = await stat(path).catch(() => null);
  if (!file?.isFile() || file.size === 0) throw new Error(`${label} is missing or empty: ${path}`);
  return readFile(path, "utf8");
}

function publicFilePath(manifestPathValue: string, label: string): string {
  if (!manifestPathValue.startsWith("/")) {
    throw new Error(`${label} must be an absolute public URL path`);
  }
  const candidate = resolve(publicRoot, `.${manifestPathValue}`);
  const publicRelative = relative(publicRoot, candidate);
  if (!publicRelative || publicRelative.startsWith("..") || isAbsolute(publicRelative)) {
    throw new Error(`${label} escapes the public directory`);
  }
  return candidate;
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertManifest(value: unknown): asserts value is MelodyManifest {
  assertRecord(value, "manifest");
  if (value.schemaVersion !== 1) throw new Error("manifest schemaVersion must be 1");
  if (
    value.sourceRepository !==
    "https://github.com/gleitz/midi-js-soundfonts/tree/gh-pages/FluidR3_GM"
  ) {
    throw new Error("manifest sourceRepository is not the expected FluidR3_GM source");
  }
  if (value.sourceRevision !== "gh-pages")
    throw new Error("manifest sourceRevision must be gh-pages");
  if (value.license !== "CC-BY-3.0") throw new Error("manifest license must be CC-BY-3.0");
  if (typeof value.licenseFile !== "string" || typeof value.attributionFile !== "string") {
    throw new Error("manifest license and attribution paths are required");
  }
  assertRecord(value.assets, "manifest assets");
  const assetNames = Object.keys(value.assets).sort();
  const expectedNames = [...expectedAssets].sort();
  if (JSON.stringify(assetNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`manifest must list exactly ${expectedAssets.length} Melody assets`);
  }
  for (const assetName of expectedAssets) {
    const asset = value.assets[assetName];
    assertRecord(asset, `manifest asset ${assetName}`);
    if (
      typeof asset.size !== "number" ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      typeof asset.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(asset.sha256)
    ) {
      throw new Error(`manifest asset ${assetName} must contain a positive size and SHA-256`);
    }
  }
}

async function sha256(path: string): Promise<string> {
  const digest = createHash("sha256");
  digest.update(await readFile(path));
  return digest.digest("hex");
}

async function verify(): Promise<void> {
  const manifestText = await readText(manifestPath, "Melody manifest");
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    throw new Error(`Melody manifest is not valid JSON: ${String(error)}`, { cause: error });
  }
  assertManifest(manifest);

  const licensePath = publicFilePath(manifest.licenseFile, "manifest licenseFile");
  const attributionPath = publicFilePath(manifest.attributionFile, "manifest attributionFile");
  const licenseText = await readText(licensePath, "FluidR3_GM license");
  const attributionText = await readText(attributionPath, "FluidR3_GM attribution");
  for (const marker of ["Creative Commons", "Attribution 3.0"]) {
    if (!licenseText.includes(marker)) throw new Error(`license is missing marker: ${marker}`);
  }
  for (const marker of [
    "FluidR3_GM",
    "Creative Commons Attribution 3.0",
    "https://github.com/gleitz/midi-js-soundfonts/tree/gh-pages/FluidR3_GM",
    ...expectedAssets,
  ]) {
    if (!attributionText.includes(marker))
      throw new Error(`attribution is missing marker: ${marker}`);
  }

  for (const assetName of expectedAssets) {
    const assetPath = normalize(join(samplesRoot, assetName));
    if (relative(samplesRoot, assetPath).startsWith("..")) {
      throw new Error(`asset path escapes FluidR3_GM directory: ${assetName}`);
    }
    const file = await stat(assetPath).catch(() => null);
    if (!file?.isFile()) throw new Error(`Melody asset is missing: ${assetName}`);
    const expected = manifest.assets[assetName]!;
    if (file.size !== expected.size) {
      throw new Error(`${assetName} size mismatch: expected ${expected.size}, got ${file.size}`);
    }
    const actualHash = await sha256(assetPath);
    if (actualHash !== expected.sha256) {
      throw new Error(
        `${assetName} SHA-256 mismatch: expected ${expected.sha256}, got ${actualHash}`,
      );
    }
  }

  const actualFiles = await readdir(samplesRoot);
  const extraFiles = actualFiles.filter(
    (file) => !expectedAssets.includes(file as (typeof expectedAssets)[number]),
  );
  if (extraFiles.length > 0)
    throw new Error(`unexpected files in FluidR3_GM: ${extraFiles.join(", ")}`);
  console.log("Melody assets verified offline: 6 files, manifest, license, and attribution OK.");
}

verify().catch((error: unknown) => {
  console.error(
    `Melody asset verification failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
