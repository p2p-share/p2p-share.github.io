import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type * as Y from "yjs";

const languageExtensions: Record<string, () => Promise<Extension>> = {
  javascript: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
  typescript: async () =>
    (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true }),
  json: async () => (await import("@codemirror/lang-json")).json(),
  html: async () => (await import("@codemirror/lang-html")).html(),
  css: async () => (await import("@codemirror/lang-css")).css(),
  markdown: async () => (await import("@codemirror/lang-markdown")).markdown(),
  python: async () => (await import("@codemirror/lang-python")).python(),
  java: async () => (await import("@codemirror/lang-java")).java(),
  cpp: async () => (await import("@codemirror/lang-cpp")).cpp(),
  sql: async () => (await import("@codemirror/lang-sql")).sql(),
  text: async () => [],
};

export const languages = [
  ["text", "Plain text"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["python", "Python"],
  ["java", "Java"],
  ["cpp", "C / C++"],
  ["html", "HTML"],
  ["css", "CSS"],
  ["json", "JSON"],
  ["markdown", "Markdown"],
  ["sql", "SQL"],
] as const;

export function CodeEditor({
  text,
  language,
  dark,
  fontSize,
  lineWrap,
  largeDocument,
}: {
  text: Y.Text;
  language: string;
  dark: boolean;
  fontSize: number;
  lineWrap: boolean;
  largeDocument: boolean;
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
    const theme = EditorView.theme(
      {
        "&": {
          height: "100%",
          color: dark ? "#e4e4e7" : "#27272a",
          backgroundColor: dark ? "#111113" : "#ffffff",
          fontSize: `${fontSize}px`,
        },
        ".cm-content": {
          fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
          padding: "20px 0 40vh",
          caretColor: "#7c5cff",
        },
        ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#7c5cff" },
        ".cm-gutters": {
          backgroundColor: dark ? "#111113" : "#ffffff",
          color: dark ? "#52525b" : "#a1a1aa",
          border: "none",
          minWidth: "48px",
        },
        ".cm-activeLine, .cm-activeLineGutter": {
          backgroundColor: dark ? "#18181b" : "#f4f4f5",
        },
        ".cm-selectionBackground, ::selection": {
          backgroundColor: dark ? "#44368a !important" : "#d8d1ff !important",
        },
        "&.cm-focused": { outline: "none" },
      },
      { dark },
    );
    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged || applyingRemote) return;
      text.doc?.transact(() => {
        let offset = 0;
        update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          const from = fromA + offset;
          const removed = toA - fromA;
          if (removed) text.delete(from, removed);
          const value = inserted.toString();
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
        largeDocument ? [] : languageExtension,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        theme,
        updateListener,
        lineWrap ? EditorView.lineWrapping : [],
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
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
      view.destroy();
    };
  }, [text, languageExtension, dark, fontSize, lineWrap, largeDocument]);

  return <div className="editor-host" ref={hostRef} aria-label="Collaborative code editor" />;
}
