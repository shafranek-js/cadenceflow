import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const fixtureRoot = resolve("tests/fixtures");
const entries = await readdir(fixtureRoot, { recursive: true });
const files = entries.filter((entry) => !entry.endsWith("/"));
console.log(`CadenceFlow fixture inventory: ${files.length} files under ${fixtureRoot}`);
