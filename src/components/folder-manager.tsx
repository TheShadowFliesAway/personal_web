"use client";
import { useState } from "react";
import { Folder, Trash2 } from "lucide-react";
import type { Document } from "@/lib/model";
import { folderTree, UNCATEGORIZED, withinFolder } from "@/lib/folders";
import { api, Empty, Modal } from "./ui";

type Result = { documents: Document[]; folders: string[]; movedCount: number };
export default function FolderManager({
  folders,
  documents,
  onChanged,
  onClose,
}: {
  folders: string[];
  documents: Document[];
  onChanged: (result: Result) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paths = folderTree(folders);
  const affected = selected
    ? documents.filter((d) => d.kind === "note" && withinFolder(d.folder, selected))
    : [];
  const descendants = selected
    ? paths.filter((p) => p !== selected && withinFolder(p, selected))
    : [];
  return (
    <Modal title="管理学习主题" onClose={() => !busy && onClose()}>
      {selected ? (
        <>
          <h3 className="folder-delete-title">删除「{selected.replaceAll("/", " / ")}」？</h3>
          <p>
            该主题{descendants.length ? `及其 ${descendants.length} 个子主题` : ""}将被移除。
            <strong>{affected.length} 篇笔记</strong>会移到“未分类”，正文、图片和关联内容都会保留。
          </p>
          {affected.some((d) => d.deletedAt) && (
            <p className="muted small-text">其中包含回收站内的笔记；它们仍保留在回收站。</p>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                setSelected(null);
                setError("");
              }}
            >
              取消
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await api<Result>("/api/folders", "DELETE", { name: selected });
                  onChanged(result);
                  setSelected(null);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在删除…" : "确认删除主题"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small-text">删除主题会一并移除子主题，笔记会保留并移到“未分类”。</p>
          <div className="folder-manager-list">
            {paths.map((path) => (
              <div className="folder-manager-row" key={path}>
                <Folder size={17} />
                <span>{path.replaceAll("/", " / ")}</span>
                {path === UNCATEGORIZED ? (
                  <small className="muted">默认主题</small>
                ) : (
                  <button
                    className="icon-button danger-hover"
                    aria-label={`删除主题 ${path}`}
                    title="删除主题"
                    onClick={() => setSelected(path)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!paths.length && <Empty title="还没有学习主题" text="创建主题后，可以在这里管理。" />}
        </>
      )}
    </Modal>
  );
}
