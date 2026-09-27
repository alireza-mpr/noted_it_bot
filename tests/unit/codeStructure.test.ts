/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

// What each folder may import from. See "Folders" in docs/CODE_STRUCTURE.md.
// Folders not listed here (the old ones, and app/) are not checked.
const ALLOWED_IMPORTS: Record<string, string[]> = {
  domain: ["domain"],
  output: ["output", "domain", "i18n"],
  i18n: ["i18n"],
  config: ["config"],
  adapters: ["adapters", "domain", "output", "i18n", "config"],
};

// Every source file as text. Vite reads them when the tests are built, because
// the Workers runtime that runs the tests cannot read files from disk.
const SOURCES = import.meta.glob<string>("../../src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("code structure", () => {
  it("finds the source files", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
  });

  it("keeps every folder's imports inside what the rules allow", () => {
    const broken = Object.entries(SOURCES).flatMap(([file, text]) => {
      const folder = topFolderOf(file);
      const allowed = folder ? ALLOWED_IMPORTS[folder] : undefined;
      if (!allowed) {
        return [];
      }
      return relativeImportsOf(text)
        .map((specifier) => ({ specifier, target: topFolderOf(resolvePath(file, specifier)) }))
        .filter(({ target }) => target !== null && !allowed.includes(target))
        .map(({ specifier }) => `${file.replace("../../", "")} imports ${specifier}`);
    });
    expect(broken).toEqual([]);
  });
});

// The folder right under src/ ("domain", "adapters", …), or null outside src/.
function topFolderOf(path: string): string | null {
  return path.match(/(?:^|\/)src\/([^/]+)\//)?.[1] ?? null;
}

// Returns the relative paths a file imports from ("../dates/dateOnly").
function relativeImportsOf(text: string): string[] {
  return [...text.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']*)["']/g)].map((match) => match[1]);
}

// Resolves an import path against the importing file's folder.
function resolvePath(fromFile: string, specifier: string): string {
  const parts = fromFile.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "..") {
      parts.pop();
    } else if (part !== ".") {
      parts.push(part);
    }
  }
  return parts.join("/");
}
