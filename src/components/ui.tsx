"use client";
import { useEffect, useRef } from "react";
import { X, FileText, ArrowUpRight } from "lucide-react";
import type { Document } from "@/lib/model";
import { statusLabels } from "@/lib/model";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Status({ status }: { status: Document["status"] }) {
  return (
    <span className={`status ${status}`}>
      <i />
      {statusLabels[status]}
    </span>
  );
}
export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="tag">{children}</span>;
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <FileText size={26} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function PaperCard({ doc, onOpen }: { doc: Document; onOpen: () => void }) {
  return (
    <button className="paper-card" onClick={onOpen}>
      <div className="card-top">
        <span className="paper-year">
          {doc.kind === "paper"
            ? `PAPER / ${doc.year || "未标年份"}`
            : `NOTE / ${doc.folder.replaceAll("/", " / ") || "未分类"}`}
        </span>
        <ArrowUpRight size={18} />
      </div>
      <h3>{doc.title || (doc.kind === "paper" ? "未命名论文" : "未命名笔记")}</h3>
      <p>
        {doc.summary ||
          (doc.kind === "paper" ? "写下你对这篇论文的第一印象。" : "记录一点自己的理解。")}
      </p>
      <div className="card-bottom">
        <div className="tags">
          {doc.tags.slice(0, 2).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
        {doc.kind === "paper" ? (
          <Status status={doc.status} />
        ) : (
          <span className="note-card-date">{dateLabel(doc.updatedAt)}编辑</span>
        )}
      </div>
    </button>
  );
}
export function download(text: string, name: string, type = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败，请重试");
  return data;
}
