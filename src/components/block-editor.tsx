"use client";
import { useEffect, useRef } from "react";
import { BlockNoteSchema, createCodeBlockSpec, type PartialBlock } from "@blocknote/core";
import {
  prepareMathMarkdown,
  inlineMathParts,
  decodeMathSource,
  displayMathSource,
} from "@/lib/markdown-math";
import { inlineMath } from "./inline-math";
import { zh } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import { SideMenuController, useCreateBlockNote } from "@blocknote/react";
import { codeBlockOptions, syntaxHighlighter } from "@blocknote/code-block";
import katex from "katex";
import "katex/dist/katex.min.css";
import "@blocknote/mantine/style.css";
const baseCodeBlock = createCodeBlockSpec({
  ...codeBlockOptions,
  defaultLanguage: "python",
  supportedLanguages: {
    ...codeBlockOptions.supportedLanguages,
    latex: { name: "LaTeX 公式", aliases: ["math"] },
  },
});
const codeBlock: typeof baseCodeBlock = {
  ...baseCodeBlock,
  implementation: {
    ...baseCodeBlock.implementation,
    render(block, editor) {
      const original = baseCodeBlock.implementation.render.call(this, block, editor);
      const dom = document.createElement("div");
      dom.className = "study-code-block";
      const tools = document.createElement("div");
      tools.className = "code-tools";
      tools.contentEditable = "false";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "复制代码";
      copy.setAttribute("aria-label", "复制代码");
      tools.appendChild(copy);
      dom.append(tools, original.dom);
      const preview = document.createElement("div");
      preview.className = "math-preview";
      preview.contentEditable = "false";
      dom.appendChild(preview);
      const getText = () => {
        const current = editor.getBlock(block.id);
        return Array.isArray(current?.content)
          ? current.content.map((c) => ("text" in c ? c.text : "")).join("")
          : "";
      };
      let mathDialog: HTMLDialogElement | null = null;
      const updatePreview = () => {
        const current = editor.getBlock(block.id);
        const isMath =
          current?.type === "codeBlock" && ["latex", "math"].includes(current.props.language);
        preview.hidden = !isMath;
        dom.classList.toggle("is-math", Boolean(isMath));
        if (original.dom instanceof HTMLElement) original.dom.hidden = Boolean(isMath);
        tools.hidden = Boolean(isMath);
        preview.setAttribute("role", "button");
        preview.setAttribute("aria-label", "编辑独立公式");
        preview.tabIndex = 0;
        if (isMath)
          katex.render(getText(), preview, {
            displayMode: true,
            throwOnError: false,
            trust: false,
          });
      };
      const closeMath = () => {
        mathDialog?.close();
        mathDialog?.remove();
        mathDialog = null;
        if (preview.isConnected) preview.focus({ preventScroll: true });
      };
      const openMath = () => {
        if (!editor.isEditable || mathDialog) return;
        const dialog = document.createElement("dialog");
        mathDialog = dialog;
        dialog.className = "modal formula-dialog";
        dialog.setAttribute("aria-label", "编辑独立公式");
        const heading = document.createElement("h2");
        heading.textContent = "编辑独立公式";
        const input = document.createElement("textarea");
        input.className = "standalone-input";
        input.rows = 5;
        input.spellcheck = false;
        input.setAttribute("aria-label", "独立公式源码");
        const initialSource = getText();
        input.value = initialSource;
        const rendered = document.createElement("div");
        rendered.className = "formula-dialog-preview";
        const renderDraft = () =>
          katex.render(input.value, rendered, {
            displayMode: true,
            throwOnError: false,
            trust: false,
          });
        input.addEventListener("input", renderDraft);
        renderDraft();
        const error = document.createElement("p");
        error.setAttribute("role", "alert");
        const actions = document.createElement("div");
        actions.className = "modal-actions";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "button";
        cancel.textContent = "取消";
        cancel.addEventListener("click", closeMath);
        const save = document.createElement("button");
        save.type = "button";
        save.className = "button primary";
        save.textContent = "保存公式";
        save.addEventListener("click", () => {
          if (!input.value.trim()) {
            error.textContent = "公式不能为空";
            return;
          }
          if (!editor.isEditable || !editor.getBlock(block.id)) {
            closeMath();
            return;
          }
          if (getText() !== initialSource) {
            error.textContent = "公式已变化，请取消后重新打开。";
            return;
          }
          const source = input.value;
          closeMath();
          if (source !== initialSource) editor.updateBlock(block.id, { content: source });
        });
        actions.append(cancel, save);
        dialog.append(heading, input, rendered, error, actions);
        dialog.addEventListener("cancel", (e) => {
          e.preventDefault();
          closeMath();
        });
        dialog.addEventListener("click", (e) => {
          if (e.target === dialog) closeMath();
        });
        document.body.appendChild(dialog);
        dialog.showModal();
        input.focus();
      };
      preview.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      preview.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openMath();
      });
      preview.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          openMath();
        }
      });
      let reset: ReturnType<typeof setTimeout>;
      const handleCopy = async () => {
        try {
          await navigator.clipboard.writeText(getText());
          copy.textContent = "已复制";
        } catch {
          copy.textContent = "请选中代码复制";
        }
        reset = setTimeout(() => {
          copy.textContent = "复制代码";
        }, 1800);
      };
      copy.addEventListener("click", handleCopy);
      const unsubscribe = editor.onChange(updatePreview);
      queueMicrotask(updatePreview);
      return {
        ...original,
        dom,
        destroy: () => {
          mathDialog?.remove();
          mathDialog = null;
          original.destroy?.();
          unsubscribe();
          clearTimeout(reset);
          copy.removeEventListener("click", handleCopy);
        },
      };
    },
  },
};
const schema = BlockNoteSchema.create().extend({
  blockSpecs: { codeBlock },
  inlineContentSpecs: { inlineMath },
});
export default function BlockEditor({
  markdown,
  blocks,
  onChange,
  onError,
  readOnly = false,
}: {
  markdown: string;
  blocks: unknown[] | null;
  onChange: (markdown: string, blocks: unknown[]) => void;
  onError: (s: string) => void;
  readOnly?: boolean;
}) {
  const ready = useRef(false);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const editor = useCreateBlockNote({
    schema,
    extensions: [syntaxHighlighter],
    dictionary: zh,
    pasteHandler: ({ event, editor, defaultPasteHandler }) => {
      if (editor.getTextCursorPosition().block.type === "codeBlock") return defaultPasteHandler();
      const text = event.clipboardData?.getData("text/plain") || "";
      const converted = prepareMathMarkdown(text);
      if (converted === text) return defaultPasteHandler();
      editor.pasteMarkdown(converted);
      return true;
    },
    initialContent: blocks?.length
      ? (blocks as PartialBlock<typeof schema.blockSchema>[])
      : undefined,
    uploadFile: async (file) => {
      try {
        if (!file.type.startsWith("image/")) throw new Error("这里只支持上传图片");
        if (file.size > 20_000_000) throw new Error("请选择 20 MB 以内的原始图片");
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", 0.88),
        );
        if (!blob || blob.size > 3_000_000) throw new Error("图片压缩后仍超过 3 MB，请缩小后上传");
        const form = new FormData();
        form.set("file", blob, "image.webp");
        const res = await fetch("/api/images", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        return data.url as string;
      } catch (e) {
        onError((e as Error).message);
        throw e;
      }
    },
  });
  const convertTypedMath = () => {
    const convert = (items: typeof editor.document): boolean => {
      for (const block of items) {
        if (
          block.type === "paragraph" &&
          Array.isArray(block.content) &&
          block.content.every((c) => c.type === "text")
        ) {
          const text = block.content.map((c) => (c.type === "text" ? c.text : "")).join("");
          const source = displayMathSource(text);
          if (source) {
            editor.updateBlock(block, {
              type: "codeBlock",
              props: { language: "latex" },
              content: source,
            });
            return true;
          }
        }
        if (block.type !== "codeBlock" && Array.isArray(block.content)) {
          let changed = false;
          const content = block.content.flatMap<(typeof block.content)[number]>((item) => {
            if (item.type !== "text" || item.styles.code) return [item];
            return inlineMathParts(item.text)
              .filter((part) => part.text)
              .map((part) => {
                if (!part.math) return { ...item, text: part.text };
                changed = true;
                return {
                  type: "inlineMath" as const,
                  content: undefined,
                  props: { source: decodeMathSource(part.text) },
                };
              });
          });
          if (changed) {
            editor.updateBlock(block, { content });
            return true;
          }
        }
        if (block.children.length && convert(block.children)) return true;
      }
      return false;
    };
    return convert(editor.document);
  };
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        if (!blocks?.length && markdown) {
          const parsed = await editor.tryParseMarkdownToBlocks(prepareMathMarkdown(markdown));
          if (mounted) editor.replaceBlocks(editor.document, parsed);
        }
        if (mounted) {
          while (convertTypedMath()) {
            /* Convert previously saved formula paragraphs. */
          }
          ready.current = true;
        }
      } catch (e) {
        onError(`正文加载失败：${(e as Error).message}`);
      }
    };
    void init();
    return () => {
      mounted = false;
      ready.current = false;
    };
    // The parent remounts the editor when explicitly importing or restoring content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
  return (
    <BlockNoteView
      editor={editor}
      theme="light"
      editable={!readOnly}
      sideMenu={false}
      onChange={() => {
        if (!ready.current) return;
        if (convertTypedMath()) return;
        const doc = editor.document;
        const replacements = new Map<string, string>();
        const exportBlocks = (items: typeof doc): typeof doc =>
          items.map((block) => ({
            ...block,
            content: Array.isArray(block.content)
              ? block.content.map((item) => {
                  if (item.type !== "inlineMath") return item;
                  const key = "MATHPLACEHOLDER" + crypto.randomUUID().replaceAll("-", "");
                  replacements.set(key, "$" + item.props.source + "$");
                  return { type: "text" as const, text: key, styles: {} };
                })
              : block.content,
            children: exportBlocks(block.children),
          })) as typeof doc;
        const md = editor.blocksToMarkdownLossy(exportBlocks(doc));
        Promise.resolve(md).then((text) => {
          for (const [key, source] of replacements) text = text.replaceAll(key, () => source);
          changeRef.current(text, doc);
        });
      }}
    >
      <SideMenuController
        floatingUIOptions={{
          useFloatingOptions: {
            middleware: [
              {
                name: "alignFirstTextLine",
                fn: ({ y, elements, rects }) => {
                  const reference = elements.reference;
                  const root = reference instanceof Element ? reference : reference.contextElement;
                  const line = root?.querySelector<HTMLElement>(".bn-inline-content");
                  if (!line) return {};
                  const style = getComputedStyle(line);
                  const lineHeight = Number.parseFloat(style.lineHeight);
                  if (!Number.isFinite(lineHeight)) return {};
                  const offset =
                    line.getBoundingClientRect().top - reference.getBoundingClientRect().top;
                  return { y: y + offset + lineHeight / 2 - rects.floating.height / 2 };
                },
              },
            ],
          },
        }}
      />
    </BlockNoteView>
  );
}
