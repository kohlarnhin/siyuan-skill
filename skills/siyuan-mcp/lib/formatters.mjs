function stringifyValue(value) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

export function sanitizeErrorMessage(message) {
  return String(message)
    .replace(/Authorization\s*:\s*Token\s+[^\s,;]+/gi, "Authorization: Token [REDACTED]")
    .replace(/Token\s+[A-Za-z0-9._=-]+/g, "Token [REDACTED]")
    .replace(/(["'])token\1\s*:\s*(["'])[^"']*\2/gi, '$1token$1: $2[REDACTED]$2');
}

export function formatNotebookList(notebooks) {
  if (!Array.isArray(notebooks) || notebooks.length === 0) {
    return "没有找到笔记本";
  }

  return notebooks
    .map((notebook, index) => {
      const state = notebook.closed ? "closed" : "open";
      return `${index + 1}. ${notebook.name} (${notebook.id}) [${state}]`;
    })
    .join("\n");
}

export function formatChildBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return "没有子块";
  }

  return blocks
    .map((block, index) => `${index + 1}. ${block.type}${block.subType ? `/${block.subType}` : ""} (${block.id})`)
    .join("\n");
}

export function formatKeyValueMap(record) {
  if (!record || typeof record !== "object" || Array.isArray(record) || Object.keys(record).length === 0) {
    return "没有属性";
  }

  return Object.entries(record)
    .map(([key, value]) => `${key}: ${stringifyValue(value)}`)
    .join("\n");
}

export function formatRows(rows, { maxLines = 20 } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "没有结果";
  }

  const preview = rows
    .slice(0, maxLines)
    .map((row, index) => `${index + 1}. ${JSON.stringify(row)}`)
    .join("\n");

  if (rows.length <= maxLines) {
    return preview;
  }

  return `${preview}\n... 还有 ${rows.length - maxLines} 条未展示`;
}

export function countDocTreeNodes(nodes) {
  if (!Array.isArray(nodes)) {
    return 0;
  }

  return nodes.reduce((total, node) => total + 1 + countDocTreeNodes(node.children), 0);
}

export function formatDocTree(nodes, indent = "") {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return "该路径下没有文档";
  }

  const lines = [];

  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const prefix = isLast ? "└── " : "├── ";
    const childIndent = indent + (isLast ? "    " : "│   ");

    lines.push(`${indent}${prefix}${node.name} (${node.id})`);

    if (Array.isArray(node.children) && node.children.length > 0) {
      lines.push(formatDocTree(node.children, childIndent));
    }
  });

  return lines.join("\n");
}

export function createSuccessResult(action, outcome = {}) {
  return {
    ok: true,
    action,
    summary: outcome.summary ?? `${action} 执行成功`,
    text: outcome.text ?? outcome.summary ?? "",
    data: outcome.data ?? null,
    warnings: Array.isArray(outcome.warnings) ? outcome.warnings : [],
    meta: outcome.meta ?? {},
  };
}

export function createErrorResult(action, error) {
  const message = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));

  return {
    ok: false,
    action,
    summary: `${action ?? "unknown_action"} 执行失败`,
    text: message,
    error: {
      message,
    },
  };
}
