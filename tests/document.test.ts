import { documentFilename, documentStats } from "../src/lib/document";

describe("document utilities", () => {
  it("creates safe language-aware filenames", () => {
    expect(documentFilename("API: demo", "typescript")).toBe("API- demo.ts");
    expect(documentFilename("script.py", "python")).toBe("script.py");
    expect(documentFilename("   ", "text")).toBe("untitled.txt");
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
