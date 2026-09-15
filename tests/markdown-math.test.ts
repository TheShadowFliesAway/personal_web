import { test } from "node:test";
import assert from "node:assert/strict";
import { mathToCodeBlocks, displayMathSource } from "../src/lib/markdown-math";
test("display math preserves LaTeX and ignores fenced code and unfinished expressions", () => {
  assert.equal(mathToCodeBlocks("$$\n\\frac{a}{b}\n$$"), "```latex\n\\frac{a}{b}\n```");
  assert.equal(mathToCodeBlocks("$$x^2$$"), "```latex\nx^2\n```");
  const code = "```python\n$$x$$\n```\n~~~text\n$$y$$\n~~~";
  assert.equal(mathToCodeBlocks(code), code);
  assert.equal(mathToCodeBlocks("$$\nunclosed"), "$$\nunclosed");
  assert.equal(displayMathSource("$$ x^2 $$"), "x^2");
  assert.equal(displayMathSource("cost $10"), null);
});

test("inline math preserves commands while leaving code and escaped dollars alone", async () => {
  const { prepareMathMarkdown, inlineMathParts, decodeMathSource } =
    await import("../src/lib/markdown-math");
  const source = String.raw`其中 $\frac{x_i}{y_i}$ 和 $h_A$，代码 ` + "`$literal$`";
  const prepared = prepareMathMarkdown(source);
  const formulas = inlineMathParts(prepared)
    .filter((p) => p.math)
    .map((p) => decodeMathSource(p.text));
  assert.deepEqual(formulas, [String.raw`\frac{x_i}{y_i}`, "h_A"]);
  assert.ok(prepared.includes("`$literal$`"));
  assert.deepEqual(
    inlineMathParts(String.raw`\$literal\$`).filter((p) => p.math),
    [],
  );
  assert.equal(prepareMathMarkdown("```python\n$x$\n```"), "```python\n$x$\n```");
});
