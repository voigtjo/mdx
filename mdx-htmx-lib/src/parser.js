export function parser(tokens) {
  const root = { type: "root", children: [] };
  const stack = [root];

  for (const token of tokens) {
    const { directive, props } = token;

    if (directive === "form") {
      const node = { type: "form", props, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      continue;
    }

    if (directive === "endform") {
      stack.pop();
      continue;
    }

    if (directive === "group") {
      const node = { type: "group", props, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      continue;
    }

    if (directive === "endgroup") {
      stack.pop();
      continue;
    }

    // leaf nodes
    const node = { type: directive, props };
    stack[stack.length - 1].children.push(node);
  }

  return root;
}
