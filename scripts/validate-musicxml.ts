import { access } from "node:fs/promises";
import { resolve } from "node:path";

const schemaDir = resolve("tests/fixtures/exports/musicxml/schema");
try {
  await access(schemaDir);
  console.log(`MusicXML schema cache available at ${schemaDir}`);
} catch {
  console.error(
    `MusicXML schema cache missing at ${schemaDir}. Add the approved MusicXML 4.0 XSD set before validation.`,
  );
  process.exitCode = 2;
}
