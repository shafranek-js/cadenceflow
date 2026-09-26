import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSampleMapBytes } from "./lib/canonicalSampleMapBytes";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function verify(): Promise<void> {
  const nylonPaths = [
    "public/audio/soundfont/acoustic_guitar_nylon-mp3.js",
    "public/audio/guitar/acoustic_guitar_nylon-mp3.js",
  ];
  const nylonCopies = await Promise.all(
    nylonPaths.map((path) => readFile(join(repositoryRoot, path))),
  );
  if (!nylonCopies[0]!.equals(nylonCopies[1]!)) {
    throw new Error("nylon guitar sample-map copies differ");
  }
  const rawNylonIsKnownForm =
    (nylonCopies[0]!.byteLength === 1837439 &&
      sha256(nylonCopies[0]!) ===
        "5375fa9e0408d960e12b6e4ec120c42bce824d80b18e982b27ddaece146a4f64") ||
    (nylonCopies[0]!.byteLength === 1837533 &&
      sha256(nylonCopies[0]!) ===
        "623c8109bd17d184c43c6578dfc01170f1e85000ee522f2c580d5fbeeb9298ce");
  if (!rawNylonIsKnownForm) {
    throw new Error("nylon guitar local bytes are not a known checkout form");
  }
  const canonicalNylon = canonicalSampleMapBytes(nylonCopies[0]!);
  if (
    canonicalNylon.byteLength !== 1837439 ||
    sha256(canonicalNylon) !== "5375fa9e0408d960e12b6e4ec120c42bce824d80b18e982b27ddaece146a4f64"
  ) {
    throw new Error("nylon guitar sample map does not match the pinned canonical source");
  }

  const handPaths = [
    "public/images/guitar-hand-fretting.png",
    "src/ui/guitar/assets/guitar-hand-fretting.png",
  ];
  const handCopies = await Promise.all(
    handPaths.map((path) => readFile(join(repositoryRoot, path))),
  );
  if (!handCopies[0]!.equals(handCopies[1]!)) {
    throw new Error("guitar hand illustration copies differ");
  }
  if (
    handCopies[0]!.byteLength !== 458663 ||
    sha256(handCopies[0]!) !== "1a8bac5e11ace981d08b12886cea81bc571768585d8d77938a8b0328acb784e2"
  ) {
    throw new Error("guitar hand illustration does not match its provenance notice");
  }

  const notice = await readFile(
    join(repositoryRoot, "public/licenses/guitar-hand-fretting-attribution.txt"),
    "utf8",
  );
  for (const marker of ["shafranek-js", "Adobe Photoshop", "PSD is no longer available"]) {
    if (!notice.includes(marker))
      throw new Error(`guitar hand notice is missing marker: ${marker}`);
  }

  console.log("Guitar asset provenance verified: nylon source and hand illustration copies match.");
}

verify().catch((error: unknown) => {
  console.error(
    `Guitar asset provenance verification failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
