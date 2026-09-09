"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Folder, Plus, Search } from "lucide-react";

// Keep the menu in the same positioned container, including inside native dialogs.
// Browser datalist popups are outside the DOM and cannot be reliably positioned/styled.
export default function FolderPicker({
  folders,
  value,
  defaultValue = "未分类",
  name,
  disabled,
  onChange,
}: {
  folders: string[];
  value?: string;
  defaultValue?: string;
  name?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}) {
  const [localValue, setLocalValue] = useState(defaultValue);
  const selected = value ?? localValue;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);
  const [height, setHeight] = useState(260);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const choices = [...new Set(["未分类", ...folders, selected].filter(Boolean))];
  const normalized = query.trim();
  const options = choices
    .filter((f) => f.toLowerCase().includes(normalized.toLowerCase()))
    .map((path) => ({ path, create: false }));
  if (normalized && normalized.length <= 200 && !choices.includes(normalized))
    options.push({ path: normalized, create: true });
  const openMenu = () => {
    if (!disabled) {
      setQuery("");
      setActive(0);
      setOpen(true);
    }
  };
  const closeMenu = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (path: string) => {
    setLocalValue(path);
    onChange?.(path);
    closeMenu();
  };
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const place = () => {
      const rect = root.current!.getBoundingClientRect();
      const dialog = root.current!.closest("dialog")?.getBoundingClientRect();
      const bottom = Math.min(window.innerHeight, dialog?.bottom ?? Infinity) - rect.bottom - 12;
      const top = rect.top - Math.max(0, dialog?.top ?? 0) - 12;
      const flip = bottom < 260 && top > bottom;
      setAbove(flip);
      setHeight(Math.max(100, Math.min(300, flip ? top : bottom)));
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
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  useEffect(() => {
    if (open)
      document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  return (
    <div
      className="folder-picker"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {name && <input type="hidden" name={name} value={selected} />}
      <button
        ref={trigger}
        type="button"
        className="folder-picker-trigger"
        role="combobox"
        aria-label="学习主题"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        <span>{selected.replaceAll("/", " / ") || "选择学习主题"}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className={`folder-picker-menu ${above ? "above" : ""}`} style={{ maxHeight: height }}>
          <div className="folder-picker-search">
            <Search size={15} />
            <input
              ref={search}
              aria-label="搜索学习主题"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={true}
              aria-controls={`${id}-list`}
              aria-activedescendant={options[active] ? `${id}-option-${active}` : undefined}
              value={query}
              maxLength={200}
              placeholder="搜索或输入新主题…"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  closeMenu();
                } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((index) =>
                    options.length
                      ? (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
                        options.length
                      : 0,
                  );
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  if (options[active]) choose(options[active].path);
                }
              }}
            />
          </div>
          <div
            id={`${id}-list`}
            role="listbox"
            aria-label="学习主题选项"
            className="folder-picker-options"
          >
            {options.map((option, index) => (
              <button
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected={selected === option.path}
                id={`${id}-option-${index}`}
                className={`folder-picker-option ${index === active ? "highlighted" : ""}`}
                key={option.path}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.path)}
              >
                {option.create ? <Plus size={14} /> : <Folder size={14} />}
                <span>
                  {option.create ? "创建并选择：" : ""}
                  {option.path.replaceAll("/", " / ")}
                </span>
                {selected === option.path && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
