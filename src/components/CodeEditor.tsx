import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultHighlightStyle, indentUnit, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { indentSelection, selectAll } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { showMinimap } from "@replit/codemirror-minimap";
import { vim } from "@replit/codemirror-vim";
import { emacs } from "@replit/codemirror-emacs";
import type * as Y from "yjs";
import type { VersionLog } from "../types";

const languageExtensions: Record<string, () => Promise<Extension>> = {
  apl: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/apl")).apl),
  brainfuck: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/brainfuck")).brainfuck),
  c: async () => (await import("@codemirror/lang-cpp")).cpp(),
  clojure: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/clojure")).clojure),
  cmake: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/cmake")).cmake),
  cobol: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/cobol")).cobol),
  coffeescript: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/coffeescript")).coffeeScript),
  cpp: async () => (await import("@codemirror/lang-cpp")).cpp(),
  csharp: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/clike")).csharp),
  css: async () => (await import("@codemirror/lang-css")).css(),
  d: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/d")).d),
  dart: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/clike")).dart),
  dockerfile: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/dockerfile")).dockerFile),
  erlang: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/erlang")).erlang),
  fortran: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/fortran")).fortran),
  go: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/go")).go),
  groovy: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/groovy")).groovy),
  haskell: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/haskell")).haskell),
  html: async () => (await import("@codemirror/lang-html")).html(),
  javascript: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
  java: async () => (await import("@codemirror/lang-java")).java(),
  jsx: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
  json: async () => (await import("@codemirror/lang-json")).json(),
  julia: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/julia")).julia),
  kotlin: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/clike")).kotlin),
  lua: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/lua")).lua),
  markdown: async () => (await import("@codemirror/lang-markdown")).markdown(),
  objectivec: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/clike")).objectiveC),
  pascal: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/pascal")).pascal),
  perl: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/perl")).perl),
  powershell: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/powershell")).powerShell),
  protobuf: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/protobuf")).protobuf),
  python: async () => (await import("@codemirror/lang-python")).python(),
  r: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/r")).r),
  rust: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/rust")).rust),
  ruby: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/ruby")).ruby),
  sass: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/sass")).sass),
  scala: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/clike")).scala),
  shell: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/shell")).shell),
  sql: async () => (await import("@codemirror/lang-sql")).sql(),
  swift: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/swift")).swift),
  text: async () => [],
  toml: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/toml")).toml),
  tsx: async () =>
    (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true }),
  typescript: async () =>
    (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true }),
  vb: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/vb")).vb),
  xml: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/xml")).xml),
  yaml: async () => StreamLanguage.define((await import("@codemirror/legacy-modes/mode/yaml")).yaml),
};

export const languages = [
  ["apl", "APL"],
  ["brainfuck", "Brainfuck"],
  ["c", "C"],
  ["csharp", "C#"],
  ["cpp", "C++"],
  ["clojure", "Clojure"],
  ["cmake", "CMake"],
  ["cobol", "COBOL"],
  ["coffeescript", "CoffeeScript"],
  ["css", "CSS"],
  ["d", "D"],
  ["dart", "Dart"],
  ["dockerfile", "Dockerfile"],
  ["erlang", "Erlang"],
  ["fortran", "Fortran"],
  ["go", "Go"],
  ["groovy", "Groovy"],
  ["haskell", "Haskell"],
  ["html", "HTML"],
  ["java", "Java"],
  ["javascript", "JavaScript"],
  ["jsx", "JavaScript JSX"],
  ["json", "JSON"],
  ["julia", "Julia"],
  ["kotlin", "Kotlin"],
  ["lua", "Lua"],
  ["markdown", "Markdown"],
  ["objectivec", "Objective-C"],
  ["pascal", "Pascal"],
  ["perl", "Perl"],
  ["php", "PHP"],
  ["text", "Plain text"],
  ["powershell", "PowerShell"],
  ["protobuf", "Protocol Buffers"],
  ["python", "Python"],
  ["r", "R"],
  ["ruby", "Ruby"],
  ["rust", "Rust"],
  ["sass", "Sass / SCSS"],
  ["scala", "Scala"],
  ["shell", "Shell / Bash"],
  ["sql", "SQL"],
  ["swift", "Swift"],
  ["toml", "TOML"],
  ["typescript", "TypeScript"],
  ["tsx", "TypeScript TSX"],
  ["vb", "Visual Basic"],
  ["xml", "XML / SVG"],
  ["yaml", "YAML"],
] as const;

export function CodeEditor({
  text,
  language,
  dark,
  fontSize,
  lineWrap,
  themeMode,
  tabSize,
  keyBinding,
  minimap,
  readOnly,
  largeDocument,
  logs,
  fileId,
  fileName,
  peerId,
  author,
  authorColor,
}: {
  text: Y.Text;
  language: string;
  dark: boolean;
  fontSize: number;
  lineWrap: boolean;
  themeMode: "light" | "dark" | "contrast";
  tabSize: number;
  keyBinding: "standard" | "vim" | "emacs";
  minimap: boolean;
  readOnly: boolean;
  largeDocument: boolean;
  logs: Y.Array<VersionLog>;
  fileId: string;
  fileName: string;
  peerId: string;
  author: string;
  authorColor: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [languageExtension, setLanguageExtension] = useState<Extension>([]);

  useEffect(() => {
    let active = true;
    void (languageExtensions[language] ?? languageExtensions.text)().then((extension) => {
      if (active) setLanguageExtension(extension);
    });
    return () => {
      active = false;
    };
  }, [language]);

  useEffect(() => {
    if (!hostRef.current) return;
    const localOrigin = Symbol("codemirror");
    let applyingRemote = false;
    const highContrast = themeMode === "contrast";
    const isDark = themeMode !== "light";
    const theme = EditorView.theme(
      {
        "&": {
          height: "100%",
          color: highContrast ? "#ffffff" : isDark ? "#e4e4e7" : "#27272a",
          backgroundColor: highContrast ? "#000000" : isDark ? "#111113" : "#ffffff",
          fontSize: `${fontSize}px`,
        },
        ".cm-content": {
          fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
          padding: "20px 0 40vh",
          caretColor: "#7c5cff",
        },
        ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#7c5cff" },
        ".cm-gutters": {
          backgroundColor: highContrast ? "#000000" : isDark ? "#111113" : "#ffffff",
          color: highContrast ? "#ffff00" : isDark ? "#71717a" : "#71717a",
          border: "none",
          minWidth: "48px",
        },
        ".cm-activeLine, .cm-activeLineGutter": {
          backgroundColor: highContrast ? "#1a1a00" : isDark ? "#18181b" : "#f4f4f5",
        },
        ".cm-selectionBackground, ::selection": {
          backgroundColor: highContrast ? "#005fcc !important" : isDark ? "#44368a !important" : "#d8d1ff !important",
        },
        "&.cm-focused": { outline: "none" },
        ".cm-minimap-gutter": { opacity: "0.72" },
      },
      { dark: isDark },
    );
    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged || applyingRemote) return;
      text.doc?.transact(() => {
        let offset = 0;
        update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          const from = fromA + offset;
          const removed = toA - fromA;
          const value = inserted.toString();
          if (removed) {
            logs.push([{
              id: crypto.randomUUID(),
              fileId,
              fileName,
              peerId,
              author,
              color: authorColor,
              action: "delete",
              fromLine: update.startState.doc.lineAt(fromA).number,
              toLine: update.startState.doc.lineAt(Math.max(fromA, toA - 1)).number,
              text: update.startState.doc.sliceString(fromA, toA),
              timestamp: Date.now(),
            }]);
            text.delete(from, removed);
          }
          if (value) {
            const fromLine = update.startState.doc.lineAt(fromA).number;
            logs.push([{
              id: crypto.randomUUID(),
              fileId,
              fileName,
              peerId,
              author,
              color: authorColor,
              action: "insert",
              fromLine,
              toLine: fromLine + (value.match(/\n/g)?.length ?? 0),
              text: value,
              timestamp: Date.now(),
            }]);
          }
          if (value) text.insert(from, value);
          offset += value.length - removed;
        });
      }, localOrigin);
    });
    const state = EditorState.create({
      doc: text.toString(),
      extensions: [
        basicSetup,
        lineNumbers(),
        keymap.of([]),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorState.tabSize.of(tabSize),
        indentUnit.of(" ".repeat(tabSize)),
        keyBinding === "vim" ? vim() : keyBinding === "emacs" ? emacs() : [],
        minimap && !largeDocument
          ? showMinimap.compute(["doc"], () => ({
              create: () => ({ dom: document.createElement("div") }),
              displayText: "blocks",
              showOverlay: "always",
            }))
          : [],
        largeDocument ? [] : languageExtension,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        theme,
        updateListener,
        lineWrap ? EditorView.lineWrapping : [],
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    const commands = (event: Event) => {
      const command = (event as CustomEvent<string>).detail;
      if (command === "find") openSearchPanel(view);
      if (command === "select-all") selectAll(view);
      if (command === "indent") indentSelection(view);
      if (command === "focus") view.focus();
    };
    window.addEventListener("p2p-editor-command", commands);
    const observer = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
      if (transaction.origin === localOrigin) return;
      applyingRemote = true;
      let position = 0;
      for (const operation of _event.delta) {
        if (operation.retain) position += operation.retain;
        if (operation.delete) {
          view.dispatch({ changes: { from: position, to: position + operation.delete } });
        }
        if (typeof operation.insert === "string") {
          view.dispatch({ changes: { from: position, insert: operation.insert } });
          position += operation.insert.length;
        }
      }
      applyingRemote = false;
    };
    text.observe(observer);
    return () => {
      text.unobserve(observer);
      window.removeEventListener("p2p-editor-command", commands);
      view.destroy();
    };
  }, [text, languageExtension, dark, themeMode, fontSize, lineWrap, tabSize, keyBinding, minimap, readOnly, largeDocument, logs, fileId, fileName, peerId, author, authorColor]);

  return <div className="editor-host" ref={hostRef} aria-label="Collaborative code editor" />;
}
