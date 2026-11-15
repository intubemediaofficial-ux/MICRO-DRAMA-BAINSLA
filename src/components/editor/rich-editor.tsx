"use client";

import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Typography from "@tiptap/extension-typography";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import Youtube from "@tiptap/extension-youtube";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { useRef, useState } from "react";

const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column{2,3}",
  defining: true,
  addAttributes() {
    return { columns: { default: 2 } };
  },
  parseHTML() {
    return [{
      tag: 'div[data-type="columns"]',
      getAttrs: (element) => ({
        columns: (element as HTMLElement).classList.contains("cms-columns-3") ? 3 : 2,
      }),
    }];
  },
  renderHTML({ HTMLAttributes }) {
    const count = Number(HTMLAttributes.columns) === 3 ? 3 : 2;
    return ["div", mergeAttributes({ "data-type": "columns", class: `cms-columns cms-columns-${count}` }), 0];
  },
});

const Column = Node.create({
  name: "column",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column", class: "cms-column" }), 0];
  },
});

const CmsLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: (element) => element.classList.contains("cms-button") ? "cms-button" : null,
        renderHTML: (attributes) => attributes.class === "cms-button" ? { class: "cms-button" } : {},
      },
    };
  },
}).configure({ openOnClick: false, autolink: true });

const CmsImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      alignment: {
        default: null,
        parseHTML: (element) => {
          const match = element.className.match(/(?:^|\s)align-(left|center|right)(?:\s|$)/);
          return match?.[1] ?? null;
        },
        renderHTML: (attributes) => attributes.alignment ? { class: `align-${attributes.alignment}` } : {},
      },
    };
  },
}).configure({ allowBase64: false, resize: { enabled: true } });

type ChangePayload = { json: JSONContent; html: string; text: string };

export default function RichEditor({
  initialContent,
  onChange,
}: {
  initialContent: JSONContent | string | null;
  onChange: (content: ChangePayload) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [codeMode, setCodeMode] = useState(false);
  const [html, setHtml] = useState("");
  const [pendingUpload, setPendingUpload] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, link: false, underline: false }),
      CmsLink,
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      Typography,
      Placeholder.configure({ placeholder: "Start writing…" }),
      CharacterCount,
      CmsImage,
      TableKit.configure({ table: { resizable: true } }),
      Youtube.configure({ nocookie: true, allowFullscreen: true }),
      Details,
      DetailsSummary,
      DetailsContent,
      Columns,
      Column,
    ],
    editorProps: {
      attributes: { class: "cms-content" },
    },
    content: initialContent ?? { type: "doc", content: [{ type: "paragraph" }] },
    onUpdate: ({ editor: updated }) => onChange({
      json: updated.getJSON(),
      html: updated.getHTML(),
      text: updated.getText(),
    }),
  });
  if (!editor) return <div className="min-h-64 animate-pulse rounded-xl bg-zinc-900" />;

  const button = (label: string, action: () => void, active = false) => (
    <button
      key={label}
      type="button"
      title={label}
      onClick={action}
      className={`rounded-lg border px-2.5 py-2 text-xs ${active ? "border-rose-400 bg-rose-500/20 text-rose-200" : "border-white/10 bg-zinc-900 text-zinc-300"}`}
    >
      {label}
    </button>
  );

  async function uploadImage(file?: File) {
    if (!file) return;
    setPendingUpload(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", "content");
      const response = await fetch("/api/admin/media/upload", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Upload failed");
      const alt = window.prompt("Describe the image for accessibility", file.name) ?? "";
      editor!.chain().focus().setImage({ src: result.url, alt }).run();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setPendingUpload(false);
    }
  }

  function toggleCode() {
    if (!codeMode) {
      setHtml(editor!.getHTML());
      setCodeMode(true);
      return;
    }
    editor!.commands.setContent(html, { emitUpdate: false });
    setCodeMode(false);
    onChange({ json: editor!.getJSON(), html: editor!.getHTML(), text: editor!.getText() });
  }

  return (
    <div ref={container} className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
      <div className="sticky top-0 z-20 flex flex-wrap gap-1.5 border-b border-white/10 bg-zinc-950/95 p-2 backdrop-blur">
        <select
          aria-label="Block type"
          value={editor.isActive("heading") ? String(editor.getAttributes("heading").level) : "p"}
          onChange={(event) => event.target.value === "p"
            ? editor.chain().focus().setParagraph().run()
            : editor.chain().focus().toggleHeading({ level: Number(event.target.value) as 1 | 2 | 3 | 4 }).run()}
          className="rounded-lg border border-white/10 bg-zinc-900 px-2 text-xs"
        >
          <option value="p">Paragraph</option>
          {[1, 2, 3, 4].map((level) => <option key={level} value={level}>Heading {level}</option>)}
        </select>
        {button("B", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
        {button("I", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
        {button("U", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
        {button("S", () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"))}
        <input aria-label="Text color" type="color" onChange={(event) => editor.chain().focus().setColor(event.target.value).run()} className="h-9 w-9 rounded border border-white/10 bg-zinc-900 p-1" />
        <input aria-label="Highlight color" type="color" defaultValue="#fbbf24" onChange={(event) => editor.chain().focus().setHighlight({ color: event.target.value }).run()} className="h-9 w-9 rounded border border-white/10 bg-zinc-900 p-1" />
        {(["left", "center", "right", "justify"] as const).map((align) =>
          button(align, () => editor.chain().focus().setTextAlign(align).run(), editor.isActive({ textAlign: align })))}
        {button("• List", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
        {button("1. List", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
        {button("Quote", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
        {button("Link", () => {
          const href = window.prompt("Link URL");
          if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
        }, editor.isActive("link"))}
        {button("Button link", () => {
          const href = window.prompt("Button URL");
          if (href) editor.chain().focus().extendMarkRange("link").setLink({ href, class: "cms-button" }).run();
        })}
        <label className="cursor-pointer rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-300">
          {pendingUpload ? "Uploading…" : "Image"}
          <input type="file" accept="image/*" className="sr-only" disabled={pendingUpload} onChange={(event) => void uploadImage(event.target.files?.[0])} />
        </label>
        {button("Table", () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-2 text-xs">Table actions</summary>
          <div className="absolute right-0 z-30 mt-2 grid w-48 gap-1 rounded-xl border border-white/10 bg-zinc-900 p-2 shadow-xl">
            {[
              ["Add row", () => editor.chain().focus().addRowAfter().run()],
              ["Add column", () => editor.chain().focus().addColumnAfter().run()],
              ["Merge cells", () => editor.chain().focus().mergeCells().run()],
              ["Split cell", () => editor.chain().focus().splitCell().run()],
              ["Toggle header row", () => editor.chain().focus().toggleHeaderRow().run()],
              ["Delete row", () => editor.chain().focus().deleteRow().run()],
              ["Delete column", () => editor.chain().focus().deleteColumn().run()],
              ["Delete table", () => editor.chain().focus().deleteTable().run()],
            ].map(([label, action]) => <button key={label as string} type="button" onClick={action as () => void} className="rounded p-2 text-left text-xs hover:bg-white/10">{label as string}</button>)}
          </div>
        </details>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-2 text-xs">+ Add block</summary>
          <div className="absolute left-0 z-30 mt-2 grid w-44 gap-1 rounded-xl border border-white/10 bg-zinc-900 p-2 shadow-xl">
            {button("Horizontal rule", () => editor.chain().focus().setHorizontalRule().run())}
            {button("Code block", () => editor.chain().focus().toggleCodeBlock().run())}
            {button("Details / FAQ", () => editor.chain().focus().setDetails().run())}
            {button("2 columns", () => editor.chain().focus().insertContent({ type: "columns", attrs: { columns: 2 }, content: [0, 1].map(() => ({ type: "column", content: [{ type: "paragraph" }] })) }).run())}
            {button("3 columns", () => editor.chain().focus().insertContent({ type: "columns", attrs: { columns: 3 }, content: [0, 1, 2].map(() => ({ type: "column", content: [{ type: "paragraph" }] })) }).run())}
            {button("YouTube", () => {
              const src = window.prompt("YouTube URL");
              if (src) editor.commands.setYoutubeVideo({ src });
            })}
          </div>
        </details>
        {button("Undo", () => editor.chain().focus().undo().run())}
        {button("Redo", () => editor.chain().focus().redo().run())}
        {button("Fullscreen", () => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void container.current?.requestFullscreen();
        })}
        {button(codeMode ? "Visual editor" : "Code editor", toggleCode)}
      </div>
      {codeMode
        ? <textarea
            value={html}
            onChange={(event) => {
              const nextHtml = event.target.value;
              setHtml(nextHtml);
              editor!.commands.setContent(nextHtml, { emitUpdate: false });
              onChange({ json: editor!.getJSON(), html: editor!.getHTML(), text: editor!.getText() });
            }}
            className="min-h-[420px] w-full resize-y bg-zinc-950 p-5 font-mono text-sm outline-none"
            aria-label="HTML editor"
          />
        : <EditorContent editor={editor} className="min-h-[420px] px-5 py-4 [&_.ProseMirror]:min-h-[380px] [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-zinc-600 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]" />}
      <div className="border-t border-white/10 px-4 py-2 text-xs text-zinc-500">
        {editor.storage.characterCount.words()} words · {editor.storage.characterCount.characters()} characters
      </div>
    </div>
  );
}
