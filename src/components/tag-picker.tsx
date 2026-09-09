"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Plus, Settings2, Trash2, X } from "lucide-react";
import { api } from "./ui";

type Entry = { name: string; count: number };
export default function TagPicker({
  value,
  onChange,
  name,
  disabled,
}: {
  value?: string[];
  onChange?: (tags: string[]) => void;
  name?: string;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState<string[]>([]);
  const selected = value ?? local;
  const [library, setLibrary] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [above, setAbove] = useState(false);
  const [height, setHeight] = useState(300);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const change = (tags: string[]) => {
    setLocal(tags);
    onChange?.(tags);
  };
  const refresh = async () => setLibrary(await api<Entry[]>("/api/tags"));
  useEffect(() => {
    if (!open) return;
    let active = true;
    api<Entry[]>("/api/tags")
      .then((rows) => {
        if (active) setLibrary(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => {
      active = false;
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!root.current) return;
      const r = root.current.getBoundingClientRect();
      const dialog = root.current.closest("dialog")?.getBoundingClientRect();
      const below = Math.min(window.innerHeight, dialog?.bottom ?? Infinity) - r.bottom - 12;
      const top = r.top - Math.max(0, dialog?.top ?? 0) - 12;
      const flip = below < 300 && top > below;
      setAbove(flip);
      setHeight(Math.max(100, Math.min(340, flip ? top : below)));
    };
    place();
    search.current?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  const choices = [...new Set([...library.map((t) => t.name), ...selected])].filter((t) =>
    t.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const toggle = (tag: string) => {
    if (selected.includes(tag)) change(selected.filter((t) => t !== tag));
    else if (selected.length < 30) change([...selected, tag]);
    else setError("每篇笔记最多选择 30 个标签");
  };
  return (
    <div
      className="tag-picker folder-picker"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !busy) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      {name && <input type="hidden" name={name} value={JSON.stringify(selected)} />}
      <div className="tag-chips">
        {selected.map((tag) => (
          <span className="tag tag-chip" key={tag}>
            {tag}
            <button
              type="button"
              disabled={disabled}
              aria-label={`移除标签 ${tag}`}
              onClick={() => change(selected.filter((t) => t !== tag))}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <button
          type="button"
          ref={trigger}
          className="text-button"
          disabled={disabled}
          aria-expanded={open}
          aria-label="添加标签"
          onClick={() => {
            setOpen(!open);
            setManage(false);
            setConfirm(null);
            setQuery("");
            setError("");
          }}
        >
          <Plus size={14} />
          添加标签
        </button>
      </div>
      {open && (
        <div
          className={`folder-picker-menu tag-picker-menu ${above ? "above" : ""}`}
          style={{ maxHeight: height }}
        >
          <div className="folder-picker-search">
            <input
              ref={search}
              aria-label="搜索标签"
              placeholder="搜索或新建标签…"
              maxLength={50}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setConfirm(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  root.current?.querySelector<HTMLButtonElement>(".tag-option button")?.focus();
                }
              }}
            />
          </div>
          <div className="tag-options" role="group" aria-label={manage ? "管理标签" : "可选标签"}>
            {choices.map((tag) => {
              const count = library.find((t) => t.name === tag)?.count ?? 0;
              const used = count > 0 || selected.includes(tag);
              return (
                <div className="tag-option" key={tag}>
                  <button
                    type="button"
                    role={manage ? undefined : "checkbox"}
                    aria-checked={manage ? undefined : selected.includes(tag)}
                    disabled={busy || manage}
                    onClick={() => toggle(tag)}
                  >
                    <span className="tag">{tag}</span>
                    {manage ? (
                      <small>{count} 篇引用</small>
                    ) : (
                      selected.includes(tag) && <Check size={15} />
                    )}
                  </button>
                  {manage && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`删除标签 ${tag}`}
                      disabled={busy || used}
                      title={used ? "请先从笔记中移除（包含回收站）" : "删除未使用的标签"}
                      onClick={() => setConfirm(tag)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
            {!choices.length && <p className="small-text muted">没有匹配的标签</p>}
          </div>
          {query.trim() &&
            !library.some((t) => t.name === query.trim()) &&
            !selected.includes(query.trim()) && (
              <button
                type="button"
                className="folder-picker-option"
                disabled={busy || selected.length >= 30}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const tag = await api<{ name: string }>("/api/tags", "POST", {
                      name: query.trim(),
                    });
                    await refresh();
                    toggle(tag.name);
                    setQuery("");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Plus size={14} />
                新建「{query.trim()}」
              </button>
            )}
          {confirm && (
            <div className="tag-delete-confirm">
              <p>从标签库删除「{confirm}」？</p>
              <button
                type="button"
                className="button small"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="button small danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api("/api/tags", "DELETE", { name: confirm });
                    await refresh();
                    setConfirm(null);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                确认删除标签
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="small-text">
              {error}
            </p>
          )}
          <div className="tag-picker-footer">
            <button
              type="button"
              className="text-button"
              onClick={async () => {
                setManage(!manage);
                setConfirm(null);
                try {
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Settings2 size={14} />
              {manage ? "返回选择" : "管理标签"}
            </button>
            {manage && <p>仅可删除未使用的标签；× 只移除当前笔记的关联。</p>}
          </div>
        </div>
      )}
    </div>
  );
}
