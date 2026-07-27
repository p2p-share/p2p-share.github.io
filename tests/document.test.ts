import { detectLanguage, documentFilename, documentStats, languageFromFilename } from "../src/lib/document";
import { languages } from "../src/components/CodeEditor";

describe("document utilities", () => {
  it("creates safe language-aware filenames", () => {
    expect(documentFilename("API: demo", "typescript")).toBe("API- demo.ts");
    expect(documentFilename("script.py", "python")).toBe("script.py");
    expect(documentFilename("   ", "text")).toBe("untitled.txt");
  });

  it("detects modern source formats from filenames", () => {
    expect(languageFromFilename("Component.tsx")).toBe("tsx");
    expect(languageFromFilename("service.rs")).toBe("rust");
    expect(languageFromFilename("Dockerfile.production")).toBe("dockerfile");
    expect(languageFromFilename("settings.yml")).toBe("yaml");
    expect(languageFromFilename("unknown.data")).toBe("text");
  });

  it("detects languages from pasted content when a filename is ambiguous", () => {
    expect(detectLanguage('{"ready":true}', "untitled")).toBe("json");
    expect(detectLanguage("def greet(name):\n    print(name)", "untitled")).toBe("python");
    expect(detectLanguage("const ready = () => true;", "untitled")).toBe("javascript");
  });

  it("keeps the language catalog unique and alphabetically ordered", () => {
    const labels = languages.map(([, label]) => label);
    expect(new Set(languages.map(([id]) => id)).size).toBe(languages.length);
    expect(labels).toEqual([...labels].sort((left, right) => left.localeCompare(right, "en")));
  });

  it("calculates editor statistics", () => {
    expect(documentStats("hello world\nnext")).toEqual({
      lines: 2,
      words: 3,
      characters: 16,
    });
    expect(documentStats("")).toEqual({ lines: 1, words: 0, characters: 0 });
  });
});
