"use client";
import { useState } from "react";
import { createReactInlineContentSpec } from "@blocknote/react";
import katex from "katex";
export const inlineMath = createReactInlineContentSpec(
  { type: "inlineMath", propSchema: { source: { default: "" } }, content: "none" },
  {
    render: function InlineMath({ inlineContent, updateInlineContent, editor }) {
      const [editing, setEditing] = useState(false);
      const [draft, setDraft] = useState(inlineContent.props.source);
      if (editing)
        return (
          <span contentEditable={false} className="inline-math-edit">
            <input
              autoFocus
              aria-label="行内公式源码"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  updateInlineContent({ type: "inlineMath", props: { source: draft } });
                  setEditing(false);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              onBlur={() => {
                updateInlineContent({ type: "inlineMath", props: { source: draft } });
                setEditing(false);
              }}
            />
          </span>
        );
      return (
        <span
          contentEditable={false}
          className="inline-math"
          role="button"
          tabIndex={0}
          aria-label={`编辑行内公式 ${inlineContent.props.source}`}
          onClick={() => {
            if (editor.isEditable) {
              setDraft(inlineContent.props.source);
              setEditing(true);
            }
          }}
          onKeyDown={(e) => {
            if (editor.isEditable && e.key === "Enter") {
              e.preventDefault();
              setDraft(inlineContent.props.source);
              setEditing(true);
            }
          }}
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(inlineContent.props.source, {
              throwOnError: false,
              trust: false,
            }),
          }}
        />
      );
    },
    toExternalHTML: ({ inlineContent }) => <span>{`$${inlineContent.props.source}$`}</span>,
  },
);
