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
