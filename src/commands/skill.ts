import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function skillFile(outputPath?: string): Promise<string> {
  const skill = await readPackagedSkill();
  if (outputPath) {
    await writeFile(outputPath, skill);
  }
  return skill;
}

async function readPackagedSkill(): Promise<string> {
  const path = await findPackagedSkill(dirname(fileURLToPath(import.meta.url)));
  return readFile(path, "utf8");
}

async function findPackagedSkill(startDir: string): Promise<string> {
  let current = resolve(startDir);

  while (true) {
    const candidate = join(current, "skill", "SKILL.md");
    if (await pathExists(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error("Could not find packaged html-collab skill");
    }
    current = parent;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
