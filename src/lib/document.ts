const extensions: Record<string, string> = {
  apl: "apl",
  brainfuck: "bf",
  clojure: "clj",
  cmake: "cmake",
  cobol: "cob",
  coffeescript: "coffee",
  d: "d",
  dart: "dart",
  erlang: "erl",
  fortran: "f90",
  groovy: "groovy",
  haskell: "hs",
  javascript: "js",
  typescript: "ts",
  jsx: "jsx",
  tsx: "tsx",
  python: "py",
  java: "java",
  cpp: "cpp",
  c: "c",
  csharp: "cs",
  go: "go",
  julia: "jl",
  rust: "rs",
  kotlin: "kt",
  lua: "lua",
  objectivec: "m",
  pascal: "pas",
  perl: "pl",
  powershell: "ps1",
  protobuf: "proto",
  r: "r",
  sass: "scss",
  scala: "scala",
  vb: "vb",
  swift: "swift",
  ruby: "rb",
  php: "php",
  shell: "sh",
  html: "html",
  css: "css",
  json: "json",
  markdown: "md",
  sql: "sql",
  yaml: "yaml",
  xml: "xml",
  toml: "toml",
  dockerfile: "Dockerfile",
  text: "txt",
};

const languageByExtension: Record<string, string> = {
  apl: "apl", bf: "brainfuck", b: "brainfuck",
  clj: "clojure", cljs: "clojure", cljc: "clojure", edn: "clojure",
  cmake: "cmake", cob: "cobol", cbl: "cobol", cpy: "cobol",
  coffee: "coffeescript", litcoffee: "coffeescript",
  d: "d", dart: "dart", erl: "erlang", hrl: "erlang",
  f: "fortran", for: "fortran", f77: "fortran", f90: "fortran", f95: "fortran", f03: "fortran",
  groovy: "groovy", gradle: "groovy", gvy: "groovy",
  hs: "haskell", lhs: "haskell",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx",
  py: "python", java: "java", c: "c", h: "c", cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp",
  cs: "csharp", go: "go", rs: "rust", kt: "kotlin", kts: "kotlin", swift: "swift",
  jl: "julia", lua: "lua", m: "objectivec", mm: "objectivec",
  pas: "pascal", pp: "pascal", pl: "perl", pm: "perl", t: "perl",
  ps1: "powershell", psm1: "powershell", psd1: "powershell",
  proto: "protobuf", r: "r", rmd: "r", scala: "scala", sc: "scala",
  rb: "ruby", rake: "ruby", gemspec: "ruby", php: "php",
  sh: "shell", bash: "shell", zsh: "shell", fish: "shell",
  html: "html", htm: "html", css: "css", json: "json", jsonc: "json",
  sass: "sass", scss: "sass", vb: "vb", vbs: "vb",
  md: "markdown", markdown: "markdown", sql: "sql", yaml: "yaml", yml: "yaml",
  xml: "xml", svg: "xml", toml: "toml", txt: "text", log: "text",
};

export function languageFromFilename(filename: string) {
  if (/^dockerfile(?:\..+)?$/i.test(filename)) return "dockerfile";
  if (/^cmakelists\.txt$/i.test(filename)) return "cmake";
  if (/^(?:makefile|gnumakefile)(?:\..+)?$/i.test(filename)) return "text";
  const extension = filename.toLowerCase().split(".").pop() || "";
  return languageByExtension[extension] || "text";
}

export function detectLanguage(content: string, filename = "") {
  const byName = languageFromFilename(filename);
  if (byName !== "text") return byName;
  const sample = content.slice(0, 64_000).trim();
  if (!sample) return "text";
  if (/^#!.*\bpython\d*\b/.test(sample) || /^(?:from|import)\s+\w+|^def\s+\w+\s*\(/m.test(sample)) return "python";
  if (/^#!.*\b(?:ba|z|fi)?sh\b/.test(sample)) return "shell";
  if (/^<!doctype html|<html[\s>]|<(?:main|section|div|script|style)[\s>]/i.test(sample)) return "html";
  if (/^(?:SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE|WITH)\b/im.test(sample)) return "sql";
  if (/^\s*#\s+\S/m.test(sample) || /\[[^\]]+\]\([^)]+\)/.test(sample)) return "markdown";
  if (/^\s*#include\s*[<"]|^\s*(?:int|void)\s+main\s*\(/m.test(sample)) return "cpp";
  if (/\bpublic\s+(?:static\s+)?class\s+\w+|\bSystem\.out\.println\s*\(/.test(sample)) return "java";
  if (/(?:^|\n)\s*(?:const|let|var)\s+\w+|(?:^|\n)\s*(?:async\s+)?function\s+\w+|=>/.test(sample)) return "javascript";
  if (/^[^{]*\{[\s\S]*:[^;{}]+;[\s\S]*\}/.test(sample)) return "css";
  try {
    JSON.parse(sample);
    return "json";
  } catch {
    return "text";
  }
}

export function documentFilename(name: string, language: string): string {
  const clean = name
    .trim()
    .replace(/[<>:"/\\|?*]/g, "-")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
    .join("")
    .replace(/\.+$/, "")
    .slice(0, 120) || "untitled";
  const extension = extensions[language] ?? "txt";
  if (language === "dockerfile") {
    return /^dockerfile(?:\.|$)/i.test(clean) ? clean : `${clean}.Dockerfile`;
  }
  return clean.toLowerCase().endsWith(`.${extension}`) ? clean : `${clean}.${extension}`;
}

export function documentStats(value: string) {
  let lines = 1;
  let words = 0;
  let inWord = false;
  let characters = 0;
  for (const character of value) {
    characters += 1;
    if (character === "\n") lines += 1;
    const whitespace = /\s/.test(character);
    if (!whitespace && !inWord) words += 1;
    inWord = !whitespace;
  }
  return {
    lines,
    words,
    characters,
  };
}

export function downloadText(value: string, filename: string) {
  const url = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
