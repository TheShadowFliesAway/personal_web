// Convert display math to the editor's existing LaTeX block without touching code fences.
export function mathToCodeBlocks(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      output.push(line);
      if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null;
      continue;
    }
    if (marker) {
      fence = marker[1];
      output.push(line);
      continue;
    }
    const single = line.match(/^\s*\$\$(.+?)\$\$\s*$/);
    if (single) {
      output.push("```latex", single[1].trim(), "```");
      continue;
    }
    if (line.trim() === "$$") {
      let end = i + 1;
      while (end < lines.length && lines[end].trim() !== "$$") end++;
      if (
        end < lines.length &&
        lines
          .slice(i + 1, end)
          .join("\n")
          .trim()
      ) {
        const content = lines.slice(i + 1, end).join("\n");
        const longest = Math.max(2, ...(content.match(/`+/g) || []).map((s) => s.length));
        const delimiter = "`".repeat(longest + 1);
        output.push(delimiter + "latex", content, delimiter);
        i = end;
        continue;
      }
    }
    output.push(line);
  }
  return output.join("\n");
}
export function displayMathSource(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("$$") || !trimmed.endsWith("$$") || trimmed.length <= 4) return null;
  const source = trimmed.slice(2, -2).trim();
  return source && !source.includes("$$") ? source : null;
}

// Dollar math cannot cross a line; escaped dollars and inline code are literal.
export function inlineMathParts(text: string): { text: string; math: boolean }[] {
  const parts: { text: string; math: boolean }[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "`") {
      let end = i;
      while (text[end] === "`") end++;
      const close = text.indexOf(text.slice(i, end), end);
      i = close < 0 ? end - 1 : close + end - i - 1;
      continue;
    }
    if (text[i] !== "$") continue;
    if (text[i + 1] === "$") {
      i++;
      continue;
    }
    let end = i + 1;
    for (; end < text.length && text[end] !== "\n"; end++) {
      if (text[end] === "\\") {
        end++;
        continue;
      }
      if (text[end] === "$") break;
    }
    if (end >= text.length || text[end] !== "$" || end === i + 1 || text[end + 1] === "$") continue;
    parts.push(
      { text: text.slice(start, i), math: false },
      { text: text.slice(i + 1, end), math: true },
    );
    start = end + 1;
    i = end;
  }
  parts.push({ text: text.slice(start), math: false });
  return parts;
}
export function prepareMathMarkdown(markdown: string): string {
  let fence: string | null = null;
  return mathToCodeBlocks(markdown)
    .split("\n")
    .map((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fence) {
        if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null;
        return line;
      }
      if (marker) {
        fence = marker[1];
        return line;
      }
      return inlineMathParts(line)
        .map((p) =>
          p.math
            ? `$MATHHEX${Array.from(new TextEncoder().encode(p.text))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("")}$`
            : p.text,
        )
        .join("");
    })
    .join("\n");
}
export function decodeMathSource(source: string) {
  if (!/^MATHHEX(?:[a-f0-9]{2})+$/.test(source)) return source;
  return new TextDecoder().decode(
    new Uint8Array(
      source
        .slice(7)
        .match(/../g)!
        .map((s) => parseInt(s, 16)),
    ),
  );
}
