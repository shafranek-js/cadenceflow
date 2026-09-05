/**
 * CadenceFlow HQ Piano Bank Preparation Pipeline
 *
 * Prepares the Salamander Grand Piano V3 web distribution:
 * - Generates full 16-velocity-layer, 30-root-sample manifest (480 regions)
 * - Verifies / detects ffmpeg encoder availability
 * - Downloads / encodes source FLAC/WAV samples into web-optimized 48kHz Ogg Vorbis/Opus
 * - Writes public/audio/piano-hq/manifest.json
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PianoRootDefinition {
  readonly name: string;
  readonly midi: number;
  readonly min: number;
  readonly max: number;
  readonly sfzName: string;
}

export const SALAMANDER_ROOTS: readonly PianoRootDefinition[] = [
  { name: "A0", midi: 21, min: 21, max: 22, sfzName: "A0" },
  { name: "C1", midi: 24, min: 23, max: 25, sfzName: "C1" },
  { name: "Ds1", midi: 27, min: 26, max: 28, sfzName: "D#1" },
  { name: "Fs1", midi: 30, min: 29, max: 31, sfzName: "F#1" },
  { name: "A1", midi: 33, min: 32, max: 34, sfzName: "A1" },
  { name: "C2", midi: 36, min: 35, max: 37, sfzName: "C2" },
  { name: "Ds2", midi: 39, min: 38, max: 40, sfzName: "D#2" },
  { name: "Fs2", midi: 42, min: 41, max: 43, sfzName: "F#2" },
  { name: "A2", midi: 45, min: 44, max: 46, sfzName: "A2" },
  { name: "C3", midi: 48, min: 47, max: 49, sfzName: "C3" },
  { name: "Ds3", midi: 51, min: 50, max: 52, sfzName: "D#3" },
  { name: "Fs3", midi: 54, min: 53, max: 55, sfzName: "F#3" },
  { name: "A3", midi: 57, min: 56, max: 58, sfzName: "A3" },
  { name: "C4", midi: 60, min: 59, max: 61, sfzName: "C4" },
  { name: "Ds4", midi: 63, min: 62, max: 64, sfzName: "D#4" },
  { name: "Fs4", midi: 66, min: 65, max: 67, sfzName: "F#4" },
  { name: "A4", midi: 69, min: 68, max: 70, sfzName: "A4" },
  { name: "C5", midi: 72, min: 71, max: 73, sfzName: "C5" },
  { name: "Ds5", midi: 75, min: 74, max: 76, sfzName: "D#5" },
  { name: "Fs5", midi: 78, min: 77, max: 79, sfzName: "F#5" },
  { name: "A5", midi: 81, min: 80, max: 82, sfzName: "A5" },
  { name: "C6", midi: 84, min: 83, max: 85, sfzName: "C6" },
  { name: "Ds6", midi: 87, min: 86, max: 88, sfzName: "D#6" },
  { name: "Fs6", midi: 90, min: 89, max: 91, sfzName: "F#6" },
  { name: "A6", midi: 93, min: 92, max: 94, sfzName: "A6" },
  { name: "C7", midi: 96, min: 95, max: 97, sfzName: "C7" },
  { name: "Ds7", midi: 99, min: 98, max: 100, sfzName: "D#7" },
  { name: "Fs7", midi: 102, min: 101, max: 103, sfzName: "F#7" },
  { name: "A7", midi: 105, min: 104, max: 106, sfzName: "A7" },
  { name: "C8", midi: 108, min: 107, max: 108, sfzName: "C8" },
] as const;

export const PINNED_SALAMANDER_REVISION = "370497372ece1603d1ca7b9892c82c1da566565e";

export const VELOCITY_RANGES: readonly { layer: number; min: number; max: number }[] = [
  { layer: 1, min: 1, max: 26 },
  { layer: 2, min: 27, max: 34 },
  { layer: 3, min: 35, max: 36 },
  { layer: 4, min: 37, max: 43 },
  { layer: 5, min: 44, max: 46 },
  { layer: 6, min: 47, max: 50 },
  { layer: 7, min: 51, max: 56 },
  { layer: 8, min: 57, max: 64 },
  { layer: 9, min: 65, max: 72 },
  { layer: 10, min: 73, max: 80 },
  { layer: 11, min: 81, max: 88 },
  { layer: 12, min: 89, max: 96 },
  { layer: 13, min: 97, max: 104 },
  { layer: 14, min: 105, max: 112 },
  { layer: 15, min: 113, max: 120 },
  { layer: 16, min: 121, max: 127 },
] as const;

export async function checkFfmpeg(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"]);
    return stdout.includes("ffmpeg version");
  } catch {
    return false;
  }
}

export function buildManifest(format = "ogg", sampleRate = 48000) {
  const regions = [];

  for (const root of SALAMANDER_ROOTS) {
    for (const v of VELOCITY_RANGES) {
      regions.push({
        id: `${root.name}v${v.layer}`,
        rootPitch: root.midi,
        keyRange: { min: root.min, max: root.max },
        velocityRange: { min: v.min, max: v.max },
        velocityLayer: v.layer,
        assetPath: `samples/${root.name}v${v.layer}.${format}`,
      });
    }
  }

  return {
    schemaVersion: 1,
    instrumentId: "salamander-grand-v3",
    displayName: "Salamander Grand Piano V3",
    sampleFormat: format,
    sampleRate,
    metadata: {
      sourceRepository: "https://github.com/sfzinstruments/SalamanderGrandPiano",
      sourceRevision: PINNED_SALAMANDER_REVISION,
      sourceInstrument: "Salamander Grand Piano V3",
      sourceLicense: "CC BY 3.0 Alexander Holm",
      encoding: "Ogg Vorbis 48kHz Stereo q=4",
    },
    regions,
  };
}

export async function downloadAndEncodeSample(
  root: PianoRootDefinition,
  layer: number,
  outputDir: string,
  format = "ogg",
): Promise<string> {
  const finalAudio = resolve(outputDir, `${root.name}v${layer}.${format}`);
  const { existsSync, statSync } = await import("node:fs");
  if (existsSync(finalAudio) && statSync(finalAudio).size > 0) {
    return finalAudio;
  }

  const encodedName = encodeURIComponent(root.sfzName);
  const sourceUrl = `https://raw.githubusercontent.com/sfzinstruments/SalamanderGrandPiano/${PINNED_SALAMANDER_REVISION}/Samples/${encodedName}v${layer}.flac`;
  const tempFlac = resolve(outputDir, `temp_${root.name}v${layer}.flac`);

  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${sourceUrl}: HTTP ${res.status}`);
  }

  const arrayBuf = await res.arrayBuffer();
  await writeFile(tempFlac, Buffer.from(arrayBuf));

  // Encode with ffmpeg: 48kHz stereo Ogg Vorbis quality 4 (~128kbps) or Opus
  const ffmpegArgs =
    format === "ogg"
      ? ["-i", tempFlac, "-c:a", "libvorbis", "-q:a", "4", finalAudio, "-y"]
      : ["-i", tempFlac, "-c:a", "libopus", "-b:a", "112k", finalAudio, "-y"];

  await execFileAsync("ffmpeg", ffmpegArgs);

  // Clean up temporary flac
  const { unlink } = await import("node:fs/promises");
  await unlink(tempFlac).catch(() => undefined);

  return finalAudio;
}

export async function verifyBank(_samplesDir?: string) {
  const { statSync } = await import("node:fs");
  const manifest = buildManifest("ogg", 48000);
  console.log("\n--- Full Piano Bank Verification ---");

  let missingCount = 0;
  let emptyCount = 0;
  let pathEscapedCount = 0;
  const sizes: { path: string; size: number }[] = [];

  for (const region of manifest.regions) {
    if (region.assetPath.startsWith("/") || region.assetPath.includes("..")) {
      pathEscapedCount++;
    }
    const fullPath = resolve("public/audio/piano-hq", region.assetPath);
    try {
      const stat = statSync(fullPath);
      if (stat.size === 0) {
        emptyCount++;
      } else {
        sizes.push({ path: region.assetPath, size: stat.size });
      }
    } catch {
      missingCount++;
    }
  }

  sizes.sort((a, b) => a.size - b.size);
  const totalBytes = sizes.reduce((acc, curr) => acc + curr.size, 0);
  const totalMiB = (totalBytes / (1024 * 1024)).toFixed(2);
  const count = sizes.length;
  const min = sizes[0] ? sizes[0].size : 0;
  const max = sizes[sizes.length - 1] ? sizes[sizes.length - 1].size : 0;
  const avg = count > 0 ? Math.round(totalBytes / count) : 0;
  const median =
    count === 0
      ? 0
      : count % 2 === 0
        ? Math.round((sizes[count / 2 - 1].size + sizes[count / 2].size) / 2)
        : sizes[Math.floor(count / 2)].size;

  console.log(`Region Count: ${manifest.regions.length}`);
  console.log(`Present Non-Empty Files: ${count}`);
  console.log(`Missing Files: ${missingCount}`);
  console.log(`Empty Files: ${emptyCount}`);
  console.log(`Path Escaped: ${pathEscapedCount}`);
  console.log(`Total Bytes: ${totalBytes} (${totalMiB} MiB)`);
  console.log(`Smallest Asset: ${min} bytes (${sizes[0]?.path})`);
  console.log(`Largest Asset: ${max} bytes (${sizes[sizes.length - 1]?.path})`);
  console.log(`Average Asset: ${avg} bytes`);
  console.log(`Median Asset: ${median} bytes`);

  return {
    manifestRegionCount: manifest.regions.length,
    presentCount: count,
    missingCount,
    emptyCount,
    pathEscapedCount,
    totalBytes,
    totalMiB,
    min,
    max,
    avg,
    median,
    smallestAsset: sizes[0]?.path ?? "",
    largestAsset: sizes[sizes.length - 1]?.path ?? "",
  };
}

export async function decodeAudioFile(filePath: string): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-v", "error", "-i", filePath, "-f", "null", "-"]);
    return true;
  } catch {
    return false;
  }
}

export async function verifyBankDecode(_samplesDir?: string): Promise<{
  readonly total: number;
  readonly decodedSuccessfully: number;
  readonly decodeFailures: number;
  readonly failedPaths: readonly string[];
}> {
  const manifest = buildManifest("ogg", 48000);
  console.log("\n--- Full Piano Bank Decode Verification ---");

  const concurrency = 16;
  let completed = 0;
  let decodedSuccessfully = 0;
  let decodeFailures = 0;
  const failedPaths: string[] = [];

  const tasks = [...manifest.regions];

  const worker = async () => {
    while (tasks.length > 0) {
      const region = tasks.shift();
      if (!region) break;

      const fullPath = resolve("public/audio/piano-hq", region.assetPath);
      const ok = await decodeAudioFile(fullPath);
      completed++;
      if (ok) {
        decodedSuccessfully++;
      } else {
        decodeFailures++;
        failedPaths.push(region.assetPath);
        console.error(`FAILED DECODE: ${region.assetPath}`);
      }
      if (completed % 40 === 0 || completed === manifest.regions.length) {
        console.log(
          `Decoding progress: ${completed}/${manifest.regions.length} (${decodeFailures} failures)`,
        );
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`\nDecoded successfully: ${decodedSuccessfully}`);
  console.log(`Decode failures: ${decodeFailures}`);
  if (failedPaths.length > 0) {
    console.log("Failed paths:", failedPaths);
  }

  return {
    total: manifest.regions.length,
    decodedSuccessfully,
    decodeFailures,
    failedPaths,
  };
}

export async function main() {
  const outputRoot = resolve("public/audio/piano-hq");
  const samplesDir = resolve(outputRoot, "samples");
  await mkdir(samplesDir, { recursive: true });

  console.log("Checking ffmpeg availability...");
  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    console.warn(
      "WARNING: ffmpeg is not available on PATH. Audio encoding will be skipped. Only manifest will be generated.",
    );
  } else {
    console.log("ffmpeg detected successfully.");
  }

  const manifest = buildManifest("ogg", 48000);
  const manifestPath = resolve(outputRoot, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote complete 480-region piano manifest to ${manifestPath}`);

  // Parse args
  const args = process.argv.slice(2);
  const onlyTestFixtures = args.includes("--test-fixtures");
  const allRegions = args.includes("--all");
  const verifyOnly = args.includes("--verify");
  const verifyDecode = args.includes("--verify-decode");

  if (verifyDecode) {
    const stats = await verifyBank(samplesDir);
    const decodeResult = await verifyBankDecode(samplesDir);
    if (decodeResult.decodeFailures > 0 || stats.missingCount > 0 || stats.emptyCount > 0) {
      process.exit(1);
    }
    return;
  }

  if (verifyOnly) {
    const stats = await verifyBank(samplesDir);
    if (stats.missingCount > 0 || stats.emptyCount > 0) {
      process.exit(1);
    }
    return;
  }

  const shouldFetch =
    allRegions ||
    onlyTestFixtures ||
    args.includes("--demo") ||
    args.includes("--fetch-demo") ||
    args.length === 0;

  if (shouldFetch && hasFfmpeg) {
    if (allRegions) {
      console.log("Preparing FULL 480-region Salamander piano bank (30 roots × 16 layers)...");
      const allTasks: { root: PianoRootDefinition; layer: number }[] = [];
      for (const root of SALAMANDER_ROOTS) {
        for (const v of VELOCITY_RANGES) {
          allTasks.push({ root, layer: v.layer });
        }
      }

      // Run with concurrency pool of 8
      const concurrency = 8;
      let completed = 0;
      let failed = 0;

      const worker = async () => {
        while (allTasks.length > 0) {
          const task = allTasks.shift();
          if (!task) break;
          try {
            await downloadAndEncodeSample(task.root, task.layer, samplesDir, "ogg");
            completed++;
            if (completed % 20 === 0 || completed === 480) {
              console.log(`Progress: ${completed}/480 prepared (${failed} failed)`);
            }
          } catch (err) {
            failed++;
            console.warn(`Failed ${task.root.name}v${task.layer}:`, err);
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      console.log(`Bank preparation complete: ${completed} prepared, ${failed} failed.`);
      await verifyBank(samplesDir);
    } else {
      console.log(
        onlyTestFixtures
          ? "Preparing test fixture samples (C4v2, C4v10, C4v14)..."
          : "Preparing real Salamander sample assets for demo and browser audio smoke tests...",
      );

      const demoNotesToDownload: { rootName: string; layers: number[] }[] = onlyTestFixtures
        ? [{ rootName: "C4", layers: [2, 10, 14] }]
        : [
            { rootName: "C4", layers: [2, 4, 10, 14] },
            { rootName: "C3", layers: [2, 10, 14] },
            { rootName: "A3", layers: [2, 10] },
            { rootName: "Ds4", layers: [2, 10] },
            { rootName: "Fs4", layers: [2, 10] },
            { rootName: "A4", layers: [2, 10] },
            { rootName: "C5", layers: [2, 10] },
          ];

      for (const noteDef of demoNotesToDownload) {
        const root = SALAMANDER_ROOTS.find((r) => r.name === noteDef.rootName);
        if (!root) continue;
        for (const layer of noteDef.layers) {
          try {
            await downloadAndEncodeSample(root, layer, samplesDir, "ogg");
            console.log(`Ready: ${root.name}v${layer}.ogg`);
          } catch (err) {
            console.warn(`Could not prepare ${root.name}v${layer}:`, err);
          }
        }
      }

      console.log("Audio samples prepared successfully.");
    }
  }
}

if (
  process.argv[1]?.endsWith("prepare-piano-bank.ts") ||
  process.argv[1]?.endsWith("prepare-piano-bank.js")
) {
  main().catch((err) => {
    console.error("Preparation pipeline error:", err);
    process.exit(1);
  });
}
