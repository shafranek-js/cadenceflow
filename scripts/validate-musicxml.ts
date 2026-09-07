import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const schemaDir = resolve("tests/fixtures/exports/musicxml/schema");
const schemaPath = resolve(schemaDir, "musicxml.xsd");
const catalogPath = resolve(schemaDir, "catalog.xml");
const inputPaths = process.argv
  .slice(2)
  .filter((path) => path !== "--")
  .map((path) => resolve(path));

async function isFile(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function errorText(error: Error): string {
  const location =
    "line" in error && typeof error.line === "number" && error.line > 0
      ? `:${error.line}${"column" in error && typeof error.column === "number" ? `:${error.column}` : ""}`
      : "";
  return `${error.message.trim()}${location}`;
}

if (inputPaths.length === 0) {
  console.error("MusicXML validation requires at least one .musicxml or .xml input path.");
  process.exitCode = 2;
} else if (!(await isFile(schemaPath)) || !(await isFile(catalogPath))) {
  console.error(
    `MusicXML 4.0 schema cache is incomplete at ${schemaDir}; expected musicxml.xsd and catalog.xml.`,
  );
  process.exitCode = 3;
} else {
  const priorCatalog = process.env.XML_CATALOG_FILES;
  process.env.XML_CATALOG_FILES = catalogPath;
  try {
    const libxml = await import("libxmljs2");
    const schema = libxml.parseXml(await readFile(schemaPath, "utf8"), {
      baseUrl: schemaPath,
      nonet: true,
    });
    if (schema.errors.length > 0) {
      throw new Error(`MusicXML schema parse failed: ${schema.errors.map(errorText).join("; ")}`);
    }

    let invalidCount = 0;
    for (const inputPath of inputPaths) {
      if (!(await isFile(inputPath))) {
        console.error(`${inputPath}: input file not found`);
        invalidCount++;
        continue;
      }
      try {
        const document = libxml.parseXml(await readFile(inputPath, "utf8"), { nonet: true });
        if (document.errors.length > 0) {
          console.error(
            `${inputPath}: XML parse error: ${document.errors.map(errorText).join("; ")}`,
          );
          invalidCount++;
          continue;
        }
        if (!document.validate(schema)) {
          const errors = document.validationErrors.map(errorText).join("; ");
          console.error(`${inputPath}: XSD validation failed${errors ? `: ${errors}` : ""}`);
          invalidCount++;
          continue;
        }
        console.log(`${inputPath}: valid MusicXML 4.0`);
      } catch (error) {
        console.error(`${inputPath}: validation error: ${errorText(error as Error)}`);
        invalidCount++;
      }
    }
    process.exitCode = invalidCount === 0 ? 0 : 1;
  } catch (error) {
    console.error(`MusicXML validator unavailable: ${errorText(error as Error)}`);
    process.exitCode = 4;
  } finally {
    if (priorCatalog === undefined) delete process.env.XML_CATALOG_FILES;
    else process.env.XML_CATALOG_FILES = priorCatalog;
  }
}
