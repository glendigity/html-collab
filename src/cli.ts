#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractFile } from "./commands/extract";
import { mergeFiles } from "./commands/merge";
import { skillFile } from "./commands/skill";
import { unwrapFile } from "./commands/unwrap";
import { wrapFile } from "./commands/wrap";
import type { ExtractFormat } from "./format/extract";

type ParsedCommand = WrapOrUnwrapCommand | MergeCommand | ExtractCommand | SkillCommand;

type WrapOrUnwrapCommand = {
  command: "wrap" | "unwrap";
  inputPath: string;
  outputPath: string;
  applyAcceptedEdits?: boolean;
};

type MergeCommand = {
  command: "merge";
  inputPaths: string[];
  outputPath: string;
};

type ExtractCommand = {
  command: "extract";
  inputPath: string;
  format: ExtractFormat;
  outputPath?: string;
};

type SkillCommand = {
  command: "skill";
  outputPath?: string;
};

export async function main(argv: string[] = process.argv): Promise<void> {
  try {
    const args = argv.slice(2);
    const commandName = basename(argv[1] ?? "html-collab");
    if (args[0] === "--help" || args[0] === "-h") {
      process.stdout.write(usage(commandName) + "\n");
      return;
    }
    if (args[0] === "--version" || args[0] === "-v") {
      process.stdout.write(packageVersion() + "\n");
      return;
    }

    const command = parseArgs(args);
    if (command.command === "wrap") {
      const result = await wrapFile(command.inputPath, command.outputPath);
      if (result.localPageReferences.length > 0) {
        writeStatus(localPageWarning(result.localPageReferences));
      }
      writeStatus(
        `Wrote ${command.outputPath} (${formatBytes(result.reviewBytes)} review file from ${formatBytes(result.sourceBytes)} source).`,
      );
      return;
    }

    if (command.command === "merge") {
      const result = await mergeFiles(command.inputPaths, command.outputPath);
      writeStatus(
        `Merged ${command.inputPaths.length} files into ${command.outputPath} (${formatBytes(result.reviewBytes)}, ${result.totalOps} ${plural(result.totalOps, "operation")}, ${result.addedOps} new).`,
      );
      return;
    }

    if (command.command === "extract") {
      const output = await extractFile(command.inputPath, {
        format: command.format,
        outputPath: command.outputPath,
      });
      if (!command.outputPath) {
        process.stdout.write(output);
      } else {
        writeStatus(
          `Wrote ${command.outputPath} (${command.format}, ${formatBytes(Buffer.byteLength(output, "utf8"))}).`,
        );
      }
      return;
    }

    if (command.command === "skill") {
      const output = await skillFile(command.outputPath);
      if (!command.outputPath) {
        process.stdout.write(output);
      } else {
        writeStatus(`Wrote ${command.outputPath} (${formatBytes(Buffer.byteLength(output, "utf8"))}).`);
      }
      return;
    }

    const result = await unwrapFile(command.inputPath, command.outputPath, {
      applyAcceptedEdits: command.applyAcceptedEdits,
    });
    if (command.applyAcceptedEdits) {
      writeStatus(applyEditsStatus(command.outputPath, result));
    } else {
      writeStatus(`Wrote ${command.outputPath} (${formatBytes(result.sourceBytes)}, original source HTML).`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error("");
    console.error(usage(basename(argv[1] ?? "html-collab")));
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): ParsedCommand {
  const [command, inputPath, ...rest] = args;
  if (command !== "wrap" && command !== "unwrap" && command !== "merge" && command !== "extract" && command !== "skill") {
    throw new Error("Expected command: wrap, merge, extract, skill, or unwrap");
  }

  if (command === "skill") {
    const outputPath = parseSkillOptions(args.slice(1));
    return { command, outputPath };
  }

  if (command === "merge") {
    const outIndex = args.indexOf("--out");
    if (outIndex === -1) {
      throw new Error("Missing required option --out");
    }
    const outputPath = args[outIndex + 1];
    if (!outputPath || outputPath.startsWith("-")) {
      throw new Error("Expected a value after --out");
    }

    const inputPaths = args.slice(1, outIndex);
    const unknownArgs = args.slice(outIndex + 2);
    if (unknownArgs.length > 0) {
      throw new Error(`Unknown option: ${unknownArgs[0]}`);
    }
    if (inputPaths.length < 2) {
      throw new Error("Expected at least two reviewed HTML files for merge");
    }

    return { command, inputPaths, outputPath };
  }

  if (command === "extract") {
    if (!inputPath || inputPath.startsWith("-")) {
      throw new Error("Expected input reviewed HTML file for extract");
    }

    const { format, outputPath } = parseExtractOptions(rest);
    return { command, inputPath, format, outputPath };
  }

  if (!inputPath || inputPath.startsWith("-")) {
    throw new Error(`Expected input HTML file for ${command}`);
  }

  if (command === "unwrap") {
    const { outputPath, applyAcceptedEdits } = parseUnwrapOptions(rest);
    return { command, inputPath, outputPath, applyAcceptedEdits };
  }

  const outputPath = readRequiredOption(rest, "--out");
  return { command, inputPath, outputPath };
}

function readRequiredOption(args: string[], name: string): string {
  const index = args.indexOf(name);
  if (index === -1) {
    throw new Error(`Missing required option ${name}`);
  }

  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Expected a value after ${name}`);
  }

  const unknownArgs = args.filter((arg, argIndex) => argIndex !== index && argIndex !== index + 1);
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown option: ${unknownArgs[0]}`);
  }

  return value;
}

function parseExtractOptions(args: string[]): { format: ExtractFormat; outputPath?: string } {
  let format: ExtractFormat = "markdown";
  let outputPath: string | undefined;
  let index = 0;

  while (index < args.length) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--format") {
      if (!isExtractFormat(value)) {
        throw new Error("Expected --format to be markdown, json, text, or agent");
      }
      format = value;
      index += 2;
      continue;
    }

    if (arg === "--out") {
      if (!value || value.startsWith("-")) {
        throw new Error("Expected a value after --out");
      }
      outputPath = value;
      index += 2;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return { format, outputPath };
}

function parseUnwrapOptions(args: string[]): { outputPath: string; applyAcceptedEdits: boolean } {
  let outputPath: string | undefined;
  let applyAcceptedEdits = false;
  let index = 0;

  while (index < args.length) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--out") {
      if (!value || value.startsWith("-")) {
        throw new Error("Expected a value after --out");
      }
      outputPath = value;
      index += 2;
      continue;
    }

    if (arg === "--apply-edits") {
      applyAcceptedEdits = true;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!outputPath) {
    throw new Error("Missing required option --out");
  }

  return { outputPath, applyAcceptedEdits };
}

function parseSkillOptions(args: string[]): string | undefined {
  if (args.length === 0) {
    return undefined;
  }
  const outputPath = readRequiredOption(args, "--out");
  return outputPath;
}

function isExtractFormat(value: string | undefined): value is ExtractFormat {
  return value === "markdown" || value === "json" || value === "text" || value === "agent";
}

function usage(commandName: string): string {
  return `Usage:
  ${commandName} --help
  ${commandName} --version
  ${commandName} wrap report.html --out report.review.html
  ${commandName} merge glen.review.html maya.review.html --out merged.review.html
  ${commandName} extract merged.review.html --format markdown --out review-brief.md
  ${commandName} extract merged.review.html --format agent --out agent-plan.md
  ${commandName} extract merged.review.html --format json --out review-bundle.json
  ${commandName} skill --out html-collab.SKILL.md
  ${commandName} unwrap report.review.html --out report.final.html
  ${commandName} unwrap report.review.html --apply-edits --out report.final.html`;
}

function writeStatus(message: string): void {
  console.error(message);
}

function localPageWarning(references: string[]): string {
  const shown = references.slice(0, 8).map((reference) => `  - ${reference}`).join("\n");
  const remaining = references.length > 8 ? `\n  - ...and ${references.length - 8} more` : "";
  return [
    "Warning: this file links to other local HTML pages.",
    "Only the top page is wrapped and commentable; those linked pages are not included in this review file.",
    shown + remaining,
  ].join("\n");
}

function applyEditsStatus(outputPath: string, result: { sourceBytes: number; appliedEdits?: number; skippedEdits?: number; openEdits?: number; rejectedEdits?: number; deletedEdits?: number }): string {
  const applied = result.appliedEdits ?? 0;
  const skipped = result.skippedEdits ?? 0;
  const skippedStatus = skipped > 0 ? `; skipped ${formatSkippedEdits(result)}` : "";
  const output = `Wrote ${outputPath} (${formatBytes(result.sourceBytes)}).`;
  if (applied === 0) {
    return `Applied 0 accepted edits${skippedStatus}. ${output}`;
  }
  return `Applied ${applied} accepted ${plural(applied, "edit")}${skippedStatus}. ${output}`;
}

function formatSkippedEdits(result: { openEdits?: number; rejectedEdits?: number; deletedEdits?: number }): string {
  const parts = [
    countLabel(result.openEdits ?? 0, "open edit"),
    countLabel(result.rejectedEdits ?? 0, "rejected edit"),
    countLabel(result.deletedEdits ?? 0, "deleted edit"),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "0 edits";
}

function countLabel(count: number, label: string): string | undefined {
  return count > 0 ? `${count} ${plural(count, label)}` : undefined;
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(kib >= 10 ? 0 : 1)} KB`;
  }
  const mib = kib / 1024;
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MB`;
}

function packageVersion(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = join(current, "package.json");
    if (existsSync(candidate)) {
      const packageJson = JSON.parse(readFileSync(candidate, "utf8")) as { version?: string };
      return packageJson.version ?? "0.0.0";
    }
    const parent = dirname(current);
    if (parent === current) {
      return "0.0.0";
    }
    current = parent;
  }
}

if (isDirectRun()) {
  await main(process.argv);
}

function isDirectRun(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return fileURLToPath(import.meta.url) === process.argv[1];
  }
}
