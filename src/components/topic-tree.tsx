"use client";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

type Topic = { name: string; path: string; children: Topic[] };
export default function TopicTree({
  folders,
  selected,
  onSelect,
}: {
  folders: string[];
  selected: string | null;
  onSelect: (path: string) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!selected) return;
    const parts = selected.split("/");
    setExpanded((old) => {
      const next = new Set(old);
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
      return next;
    });
  }, [selected]);
  const roots: Topic[] = [];
  for (const folder of [...new Set(folders)].sort((a, b) => a.localeCompare(b))) {
    let siblings = roots;
    const parts = folder.split("/").filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join("/");
      let node = siblings.find((item) => item.path === path);
      if (!node) {
        node = { name: parts[i], path, children: [] };
        siblings.push(node);
      }
      siblings = node.children;
    }
  }
  const toggle = (path: string) =>
    setExpanded((old) => {
      const next = new Set(old);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const render = (nodes: Topic[], depth = 0) => (
    <ul className="topic-tree-list">
      {nodes.map((node, i) => {
        const hasChildren = node.children.length > 0;
        const open = expanded.has(node.path);
        return (
          <li key={node.path}>
            <div
              className={`topic-tree-row ${selected === node.path ? "active" : ""}`}
              style={{ paddingLeft: Math.min(depth, 6) * 12 }}
            >
              <button
                className="topic-item"
                type="button"
                title={node.path}
                aria-current={selected === node.path ? "page" : undefined}
                aria-expanded={hasChildren ? open : undefined}
                onClick={async () => {
                  if (await onSelect(node.path)) {
                    if (hasChildren) toggle(node.path);
                  }
                }}
              >
                <span className={`topic-dot color-${i % 3}`} />
                <span>{node.name}</span>
              </button>
              {hasChildren && (
                <button
                  className="topic-toggle"
                  type="button"
                  aria-label={`${open ? "收起" : "展开"}主题 ${node.path}`}
                  aria-expanded={open}
                  onClick={() => toggle(node.path)}
                >
                  <ChevronRight
                    size={13}
                    style={{ transform: open ? "rotate(90deg)" : undefined }}
                  />
                </button>
              )}
            </div>
            {hasChildren && open && render(node.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );
  return (
    <nav className="sidebar-topics" aria-label="学习主题目录">
      {render(roots)}
    </nav>
  );
}
