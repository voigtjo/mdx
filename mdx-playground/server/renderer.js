export function renderer(ast) {
  return renderNodes(ast.children);
}

function renderNodes(nodes) {
  return nodes.map(renderNode).join("\n");
}

function renderNode(node) {
  switch (node.type) {
    case "form":
      return `
<form hx-post="${node.props.action || "#"}"
      hx-target="#form-result"
      method="${node.props.method || "post"}"
      class="space-y-6 p-4 border rounded-lg bg-white shadow">
  ${renderNodes(node.children)}
</form>
<div id="form-result" class="mt-4"></div>
`;

    case "input":
      return `
<div>
  <label class="block mb-2 text-sm font-medium text-gray-900">
    ${node.props.label}
  </label>
  <input name="${node.props.name}"
         type="${node.props.type || "text"}"
         class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5" />
</div>
`;

    case "checkbox":
      return `
<div class="flex items-center">
  <input id="${node.props.name}" name="${node.props.name}" type="checkbox"
         class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded">
  <label for="${node.props.name}" class="ms-2 text-sm font-medium text-gray-900">
    ${node.props.label}
  </label>
</div>
`;

    case "select":
      if (node.props.source) {
        return `
<div hx-get="${node.props.source}" 
     hx-trigger="load" 
     hx-target="select[name='${node.props.name}']">
  <label class="block mb-2 text-sm font-medium text-gray-900">${node.props.label}</label>
  <select name="${node.props.name}"
          class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5">
  </select>
</div>
`;
      }

      // static options
      const options = (node.props.options || "")
        .split(",")
        .map((o) => `<option value="${o}">${o}</option>`)
        .join("");

      return `
<div>
  <label class="block mb-2 text-sm font-medium text-gray-900">${node.props.label}</label>
  <select name="${node.props.name}"
          class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5">
      ${options}
  </select>
</div>
`;

    case "submit":
      return `
<button type="submit"
        class="text-white bg-blue-700 hover:bg-blue-800 
               font-medium rounded-lg text-sm px-5 py-2.5">
  ${node.props.label}
</button>
`;

    case "group":
      return `
<div class="p-4 border rounded-lg bg-gray-50">
  <p class="font-semibold mb-3">${node.props.label}</p>
  ${renderNodes(node.children)}
</div>
`;

    default:
      return `<!-- unknown node: ${node.type} -->`;
  }
}
