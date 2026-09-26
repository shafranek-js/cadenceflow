import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSampleMapBytes } from "./lib/canonicalSampleMapBytes";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicRoot = join(repositoryRoot, "public");
const catalogPath = join(repositoryRoot, "src", "domain", "melody", "instrumentCatalog.ts");
const manifestPath = join(publicRoot, "audio", "melody", "manifest.json");
const sourceRevision = "044fab8e1456bfafc5776e86dfd6bb8697149aef";

const stableIds = new Map<number, string>([
  [40, "violin"],
  [42, "cello"],
  [68, "oboe"],
  [71, "clarinet"],
  [73, "flute"],
  [80, "synth-lead"],
]);

interface ManifestAsset {
  readonly sourceName: string;
  readonly sourceFile: string;
  readonly size: number;
  readonly sha256: string;
  readonly sourceSize?: number;
  readonly sourceSha256?: string;
  readonly sourceUrl?: string;
  readonly derivation?: string;
}

interface ManifestProgram {
  readonly program: number;
  readonly instrumentId: string;
  readonly sourceName: string;
  readonly asset: string;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function localAssetPath(program: number, sourceName: string): string {
  const sourceFile = `${sourceName}-mp3.js`;
  if (program === 25) return `/audio/guitar/${sourceFile}`;
  if (stableIds.has(program)) return `/audio/melody/FluidR3_GM/${sourceFile}`;
  return `/audio/soundfont/${sourceFile}`;
}

async function main(): Promise<void> {
  const catalogSource = await readFile(catalogPath, "utf8");
  const body = catalogSource.match(
    /FLUID_R3_NAMES: readonly string\[\] = Object\.freeze\(\[(.*?)\]\);/s,
  )?.[1];
  if (!body) throw new Error("Could not read FLUID_R3_NAMES from instrumentCatalog.ts");

  const sourceNames = [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
  if (sourceNames.length !== 128) {
    throw new Error(`Expected 128 FluidR3 source names, got ${sourceNames.length}`);
  }

  const programs: ManifestProgram[] = sourceNames.map((sourceName, program) => ({
    program,
    instrumentId: stableIds.get(program) ?? `gm-${String(program).padStart(3, "0")}`,
    sourceName,
    asset: localAssetPath(program, sourceName),
  }));
  const assets: Record<string, ManifestAsset> = {};

  for (const entry of programs) {
    if (assets[entry.asset]) throw new Error(`Duplicate manifest asset: ${entry.asset}`);
    const relativePath = entry.asset.slice(1).replaceAll("/", "\\");
    const filePath = join(publicRoot, relativePath);
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error(`Manifest asset is not a file: ${entry.asset}`);
    const canonicalBytes = canonicalSampleMapBytes(await readFile(filePath));
    assets[entry.asset] = {
      sourceName: entry.sourceName,
      sourceFile: `${entry.sourceName}-mp3.js`,
      size: canonicalBytes.byteLength,
      sha256: sha256(canonicalBytes),
    };
    if (entry.sourceName === "acoustic_guitar_nylon") {
      if (
        canonicalBytes.byteLength !== 1837439 ||
        sha256(canonicalBytes) !==
          "5375fa9e0408d960e12b6e4ec120c42bce824d80b18e982b27ddaece146a4f64"
      ) {
        throw new Error("nylon guitar sample map does not match the pinned canonical source");
      }
      assets[entry.asset] = {
        ...assets[entry.asset],
        sourceSize: 1837439,
        sourceSha256: "5375fa9e0408d960e12b6e4ec120c42bce824d80b18e982b27ddaece146a4f64",
        sourceUrl:
          "https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/044fab8e1456bfafc5776e86dfd6bb8697149aef/FluidR3_GM/acoustic_guitar_nylon-mp3.js",
        derivation:
          "Pinned upstream LF bytes; Git may convert the 94 LF line endings to CRLF in Windows checkouts. Sample data unchanged.",
      };
    }
  }

  const manifest = {
    schemaVersion: 2,
    instrumentId: "fluidr3-gm-midi-js-samples",
    displayName: "FluidR3 GM sampled melody instruments",
    format: "MIDI.js MP3 sample maps",
    bytePolicy:
      "Asset size and SHA-256 use canonical LF bytes. Verification also accepts the exact CRLF checkout derivation produced by Git on Windows.",
    sourceRepository: `https://github.com/gleitz/midi-js-soundfonts/tree/${sourceRevision}/FluidR3_GM`,
    sourceRevision,
    sourceDirectory: "FluidR3_GM",
    sourceArtifact: "FluidR3_GM.sf2",
    license: "CC-BY-3.0",
    licenseFile: "/licenses/FluidR3_GM-CC-BY-3.0.txt",
    attributionFile: "/licenses/FluidR3_GM-attribution.txt",
    programCount: 128,
    programs,
    assets,
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const totalBytes = Object.values(assets).reduce((total, asset) => total + asset.size, 0);
  console.log(
    JSON.stringify(
      {
        manifest: manifestPath,
        programs: programs.length,
        assets: Object.keys(assets).length,
        totalBytes,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
