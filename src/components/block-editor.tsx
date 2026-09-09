"use client";
import { useEffect, useRef } from "react";
import { BlockNoteSchema, createCodeBlockSpec, type PartialBlock } from "@blocknote/core";
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
      const updatePreview = () => {
        const current = editor.getBlock(block.id);
        const isMath =
          current?.type === "codeBlock" && ["latex", "math"].includes(current.props.language);
        preview.hidden = !isMath;
        if (isMath)
          katex.render(getText(), preview, {
            displayMode: true,
            throwOnError: false,
            trust: false,
          });
      };
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
          original.destroy?.();
          unsubscribe();
          clearTimeout(reset);
          copy.removeEventListener("click", handleCopy);
        },
      };
    },
  },
};
const schema = BlockNoteSchema.create().extend({ blockSpecs: { codeBlock } });
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
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        if (!blocks?.length && markdown) {
          const parsed = await editor.tryParseMarkdownToBlocks(markdown);
          if (mounted) editor.replaceBlocks(editor.document, parsed);
        }
        if (mounted) ready.current = true;
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
        const doc = editor.document;
        const md = editor.blocksToMarkdownLossy(doc);
        Promise.resolve(md).then((text) => changeRef.current(text, doc));
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
