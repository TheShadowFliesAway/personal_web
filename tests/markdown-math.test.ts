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
