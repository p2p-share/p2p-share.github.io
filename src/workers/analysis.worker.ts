import * as prettier from "prettier/standalone";
import babel from "prettier/plugins/babel";
import estree from "prettier/plugins/estree";
import typescript from "prettier/plugins/typescript";
import html from "prettier/plugins/html";
import postcss from "prettier/plugins/postcss";
import markdown from "prettier/plugins/markdown";
import { format as formatSql } from "sql-formatter";
import ts from "typescript";
import type { AnalysisReport, Diagnostic } from "../types";

type Request =
  | { id: string; action: "analyze"; content: string; language: string }
  | { id: string; action: "format"; content: string; language: string; tabSize: number };

function analyze(content: string, language: string): AnalysisReport {
  const lines = content.split(/\r?\n/);
  const diagnostics: Diagnostic[] = [];
  const todos: AnalysisReport["todos"] = [];
  const dependencies = new Set<string>();
  const duplicateLines: AnalysisReport["duplicateLines"] = [];
  const firstLines = new Map<string, number>();
  let complexity = 1;
  let indentKind: "tabs" | "spaces" | undefined;

  lines.forEach((line, index) => {
    const number = index + 1;
    const trimmed = line.trim();
    if (/\s+$/.test(line)) diagnostics.push({ severity: "warning", line: number, rule: "trailing-space", message: "Trailing whitespace." });
    if (line.length > 160) diagnostics.push({ severity: "info", line: number, rule: "long-line", message: `Line is ${line.length} characters.` });
    if (/^(?:\t+| +)\S/.test(line)) {
      const kind = line.startsWith("\t") ? "tabs" : "spaces";
      if (!indentKind) indentKind = kind;
      else if (kind !== indentKind) diagnostics.push({ severity: "warning", line: number, rule: "mixed-indent", message: "Mixed tab and space indentation." });
    }
    const todo = line.match(/\b(TODO|FIXME|HACK|XXX)\b[:\s-]*(.*)/i);
    if (todo) todos.push({ line: number, text: `${todo[1].toUpperCase()}: ${todo[2] || trimmed}` });
    if (trimmed.length > 3 && firstLines.has(trimmed)) duplicateLines.push({ line: number, duplicateOf: firstLines.get(trimmed)! });
    else if (trimmed.length > 3) firstLines.set(trimmed, number);
    if (/\b(if|else if|for|while|case|catch)\b|&&|\|\||\?\s*[^:]+:/.test(line)) complexity += 1;
    for (const match of line.matchAll(/(?:from\s+|require\s*\(\s*|import\s*\(\s*)["']([^"'./][^"']*)["']/g)) {
      dependencies.add(match[1].split("/").slice(0, match[1].startsWith("@") ? 2 : 1).join("/"));
    }
  });

  if (language === "json") {
    try { JSON.parse(content); } catch (error) {
      diagnostics.unshift({ severity: "error", rule: "json-syntax", message: error instanceof Error ? error.message : "Invalid JSON." });
    }
  }
  if (["javascript", "typescript", "jsx", "tsx"].includes(language)) {
    const fileName = language === "typescript" ? "file.ts" : language === "tsx" ? "file.tsx" : language === "jsx" ? "file.jsx" : "file.js";
    const transpiled = ts.transpileModule(content, {
      fileName,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.Preserve,
        allowJs: true,
      },
    });
    for (const diagnostic of transpiled.diagnostics || []) {
      const position = diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : undefined;
      diagnostics.unshift({
        severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning",
        line: position ? position.line + 1 : undefined,
        rule: `ts-${diagnostic.code}`,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      });
    }
    if (/\bvar\s+/.test(content)) diagnostics.push({ severity: "info", rule: "prefer-modern-binding", message: "Consider let or const instead of var." });
  }
  if (language === "markdown") {
    lines.forEach((line, index) => {
      if (/^#{1,6}[^ #]/.test(line)) diagnostics.push({ severity: "warning", line: index + 1, rule: "md-heading-space", message: "Add a space after the heading marker." });
    });
  }
  return { diagnostics, todos, dependencies: [...dependencies].sort(), duplicateLines, complexity, lines: lines.length, characters: content.length };
}

async function formatCode(content: string, language: string, tabWidth: number) {
  if (language === "json") return `${JSON.stringify(JSON.parse(content), null, tabWidth)}\n`;
  if (language === "sql") return formatSql(content, { tabWidth });
  const parser: Record<string, string> = {
    javascript: "babel", jsx: "babel", typescript: "typescript", tsx: "typescript",
    html: "html", xml: "html", css: "css", sass: "scss", markdown: "markdown",
  };
  const selected = parser[language];
  if (!selected) throw new Error(`Formatting is not available for ${language}.`);
  return prettier.format(content, {
    parser: selected,
    plugins: [babel, estree, typescript, html, postcss, markdown],
    tabWidth,
    useTabs: false,
  });
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    const result = request.action === "analyze"
      ? analyze(request.content, request.language)
      : await formatCode(request.content, request.language, request.tabSize);
    self.postMessage({ id: request.id, result });
  } catch (error) {
    self.postMessage({ id: request.id, error: error instanceof Error ? error.message : "Worker operation failed." });
  }
};
