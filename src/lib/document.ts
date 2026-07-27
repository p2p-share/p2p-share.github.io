const extensions: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  java: "java",
  cpp: "cpp",
  html: "html",
  css: "css",
  json: "json",
  markdown: "md",
  sql: "sql",
  text: "txt",
};

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
