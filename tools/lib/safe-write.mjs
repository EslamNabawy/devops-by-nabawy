// safe-write: atomic file write (tmp + rename). Write guard: never touch sources.
import { promises as fs } from "node:fs";
import path from "node:path";

export async function safeWrite(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp-" + process.pid;
  await fs.writeFile(tmp, content);
  await fs.rename(tmp, file);
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}
