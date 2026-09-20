import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicRoot = join(repositoryRoot, "public");
const manifestPath = join(publicRoot, "audio", "melody", "manifest.json");
const expectedSourceRevision = "044fab8e1456bfafc5776e86dfd6bb8697149aef";

interface MelodyAssetRecord {
  readonly sourceName: string;
  readonly sourceFile: string;
  readonly size: number;
  readonly sha256: string;
}

interface MelodyProgramRecord {
  readonly program: number;
  readonly instrumentId: string;
  readonly sourceName: string;
  readonly asset: string;
}

interface MelodyManifest {
  readonly schemaVersion: number;
  readonly sourceRepository: string;
  readonly sourceRevision: string;
  readonly sourceDirectory: string;
  readonly sourceArtifact: string;
  readonly license: string;
  readonly licenseFile: string;
  readonly attributionFile: string;
  readonly programCount: number;
  readonly programs: readonly MelodyProgramRecord[];
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
  if (value.schemaVersion !== 2) throw new Error("manifest schemaVersion must be 2");
  if (
    value.sourceRepository !==
    `https://github.com/gleitz/midi-js-soundfonts/tree/${expectedSourceRevision}/FluidR3_GM`
  ) {
    throw new Error("manifest sourceRepository is not the expected FluidR3_GM source");
  }
  if (value.sourceRevision !== expectedSourceRevision || value.sourceDirectory !== "FluidR3_GM") {
    throw new Error("manifest source revision/directory is not the expected FluidR3_GM source");
  }
  if (value.sourceArtifact !== "FluidR3_GM.sf2") {
    throw new Error("manifest sourceArtifact must be FluidR3_GM.sf2");
  }
  if (value.license !== "CC-BY-3.0") throw new Error("manifest license must be CC-BY-3.0");
  if (value.programCount !== 128) throw new Error("manifest programCount must be 128");
  if (typeof value.licenseFile !== "string" || typeof value.attributionFile !== "string") {
    throw new Error("manifest license and attribution paths are required");
  }
  if (!Array.isArray(value.programs) || value.programs.length !== 128) {
    throw new Error("manifest must list exactly 128 GM programs");
  }
  assertRecord(value.assets, "manifest assets");
  if (Object.keys(value.assets).length !== 128) {
    throw new Error("manifest must list exactly 128 unique local assets");
  }

  const programs = new Set<number>();
  const assets = new Set<string>();
  for (const [index, program] of value.programs.entries()) {
    const programRecord = program as unknown as Record<string, unknown>;
    assertRecord(programRecord, `manifest program ${index}`);
    const programNumber = programRecord.program;
    if (
      typeof programNumber !== "number" ||
      !Number.isInteger(programNumber) ||
      programNumber < 0 ||
      programNumber > 127 ||
      programs.has(programNumber)
    ) {
      throw new Error(`manifest has a missing or duplicate GM program at index ${index}`);
    }
    if (
      typeof programRecord.instrumentId !== "string" ||
      typeof programRecord.sourceName !== "string" ||
      typeof programRecord.asset !== "string"
    ) {
      throw new Error(`manifest program ${programNumber} metadata is incomplete`);
    }
    if (assets.has(programRecord.asset)) {
      throw new Error(`manifest reuses asset: ${programRecord.asset}`);
    }
    programs.add(programNumber);
    assets.add(programRecord.asset);
    const asset = value.assets[programRecord.asset];
    assertRecord(asset, `manifest asset ${programRecord.asset}`);
    if (
      asset.sourceName !== programRecord.sourceName ||
      asset.sourceFile !== `${programRecord.sourceName}-mp3.js` ||
      typeof asset.size !== "number" ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      typeof asset.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(asset.sha256)
    ) {
      throw new Error(`manifest asset ${programRecord.asset} metadata is invalid`);
    }
  }
  for (let program = 0; program < 128; program += 1) {
    if (!programs.has(program)) throw new Error(`manifest is missing GM program ${program}`);
  }
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
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
    `https://github.com/gleitz/midi-js-soundfonts/tree/${expectedSourceRevision}/FluidR3_GM`,
    "all 128 General MIDI programs",
    "manifest.json",
  ]) {
    if (!attributionText.includes(marker)) {
      throw new Error(`attribution is missing marker: ${marker}`);
    }
  }

  for (const program of manifest.programs) {
    const asset = manifest.assets[program.asset]!;
    const assetPath = publicFilePath(program.asset, `manifest asset ${program.asset}`);
    const file = await stat(assetPath).catch(() => null);
    if (!file?.isFile()) throw new Error(`Melody asset is missing: ${program.asset}`);
    if (file.size !== asset.size) {
      throw new Error(`${program.asset} size mismatch: expected ${asset.size}, got ${file.size}`);
    }
    const actualHash = await sha256(assetPath);
    if (actualHash !== asset.sha256) {
      throw new Error(
        `${program.asset} SHA-256 mismatch: expected ${asset.sha256}, got ${actualHash}`,
      );
    }
  }

  const soundfontRoot = join(publicRoot, "audio", "soundfont");
  const managedSoundfontFiles = manifest.programs
    .map((program) => program.asset)
    .filter((asset) => asset.startsWith("/audio/soundfont/"))
    .map((asset) => asset.slice("/audio/soundfont/".length))
    .sort();
  const actualSoundfontFiles = (await readdir(soundfontRoot)).sort();
  if (JSON.stringify(actualSoundfontFiles) !== JSON.stringify(managedSoundfontFiles)) {
    throw new Error("public/audio/soundfont contains files not covered by the manifest");
  }

  console.log(
    `Melody assets verified offline: ${manifest.programs.length} GM programs, ${
      Object.keys(manifest.assets).length
    } local assets, hashes, license, and attribution OK.`,
  );
}

verify().catch((error: unknown) => {
  console.error(
    `Melody asset verification failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
