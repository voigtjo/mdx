export function tokenizer(mdx) {
  const lines = mdx.split("\n");
  const tokens = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("@//")) continue;

    const match = trimmed.match(/^@(\w+)(.*)$/);
    if (!match) continue;

    const [, directive, rest] = match;

    // parse props: key="value"
    const props = {};
    const propRegex = /(\w+)="([^"]*)"/g;
    let propMatch;
    while ((propMatch = propRegex.exec(rest)) !== null) {
      props[propMatch[1]] = propMatch[2];
    }

    tokens.push({ directive, props });
  }

  return tokens;
}
