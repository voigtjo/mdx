import { tokenizer } from "./tokenizer.js";
import { parser } from "./parser.js";
import { renderer } from "./renderer.js";

export function mdxToHtmx(mdxSource) {
  const tokens = tokenizer(mdxSource);
  const ast = parser(tokens);
  const html = renderer(ast);
  return html;
}

export { tokenizer, parser, renderer };
