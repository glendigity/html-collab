import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { skillFile } from "../src/commands/skill";

describe("skill", () => {
  test("returns the packaged agent workflow skill", async () => {
    const skill = await skillFile();

    expect(skill).toContain("name: html-collab");
    expect(skill).toContain("extract --format agent");
    expect(skill).toContain("Suggested edits are deterministic instructions.");
  });

  test("writes the packaged skill when --out is used", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "html-collab-"));
    try {
      const outPath = join(tempDir, "html-collab.SKILL.md");

      await skillFile(outPath);

      const skill = await readFile(outPath, "utf8");
      expect(skill).toContain("html-collab skill --out html-collab.SKILL.md");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
