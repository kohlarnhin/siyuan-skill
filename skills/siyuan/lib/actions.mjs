import {
  countDocTreeNodes,
  createSuccessResult,
  formatChildBlocks,
  formatDocTree,
  formatKeyValueMap,
  formatNotebookList,
  formatRows,
} from "./formatters.mjs";

const BLOCK_DATA_TYPES = new Set(["markdown", "dom"]);
const SQL_WRITE_PATTERN = /\b(insert|update|delete|replace|alter|drop|create|truncate|attach|detach|vacuum|reindex|pragma)\b/i;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(params, key, label = key) {
  const value = params[key];
  if (!isPlainObject(value)) {
    throw new Error(`${label} 必须是对象`);
  }

  return value;
}

function requireString(params, key, label = key) {
  const value = params[key];
  if (typeof value !== "string") {
    throw new Error(`${label} 必须是字符串`);
  }

  return value;
}

function requireNonEmptyString(params, key, label = key) {
  const value = requireString(params, key, label).trim();
  if (!value) {
    throw new Error(`${label} 不能为空`);
  }

  return value;
}

function optionalString(params, key) {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${key} 必须是字符串`);
  }

  return value;
}

function requireStringArray(params, key, label = key) {
  const value = params[key];
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} 必须是非空字符串数组`);
  }

  return value;
}

function requireRecordOfStrings(params, key, label = key) {
  const record = requireObject(params, key, label);

  for (const [entryKey, entryValue] of Object.entries(record)) {
    if (typeof entryValue !== "string") {
      throw new Error(`${label}.${entryKey} 必须是字符串`);
    }
  }

  return record;
}

function requireBlockDataType(params) {
  const value = requireNonEmptyString(params, "dataType", "dataType");
  if (!BLOCK_DATA_TYPES.has(value)) {
    throw new Error(`dataType 只支持 ${Array.from(BLOCK_DATA_TYPES).join(", ")}`);
  }

  return value;
}

function normalizeMaxDepth(value, fallback = 3) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 10);
}

function normalizeLimit(value, fallback, maxLimit) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.max(1, parsed), maxLimit);
}

function ensureAbsolutePath(path, label = "path") {
  if (!path.startsWith("/")) {
    throw new Error(`${label} 必须以 / 开头`);
  }

  return path;
}

function getParentPath(path) {
  const lastSlashIndex = path.lastIndexOf("/");
  return lastSlashIndex <= 0 ? "/" : path.slice(0, lastSlashIndex);
}

function escapeLikeKeyword(keyword) {
  return keyword
    .replace(/'/g, "''")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function stripSqlStringsAndComments(sql) {
  return sql
    .replace(/--[^\n]*(\n|$)/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, " ")
    .replace(/"(?:""|[^"])*"/g, " ")
    .replace(/`[^`]*`/g, " ");
}

function hasPotentialWriteSql(sql) {
  return SQL_WRITE_PATTERN.test(stripSqlStringsAndComments(sql));
}

function extractFirstOperationId(result) {
  return result?.[0]?.doOperations?.[0]?.id ?? null;
}

function toPrettyJson(value) {
  return JSON.stringify(value, null, 2);
}

async function getIdsByHPath(client, notebookId, path) {
  return client.request("/api/filetree/getIDsByHPath", {
    path,
    notebook: notebookId,
  });
}

async function getPathByID(client, id) {
  return client.request("/api/filetree/getPathByID", { id });
}

async function listDocsByPath(client, notebookId, path = "/") {
  return client.request("/api/filetree/listDocsByPath", {
    notebook: notebookId,
    path,
  });
}

async function checkPathExistsHelper(client, notebookId, hPath) {
  const ids = await getIdsByHPath(client, notebookId, hPath);
  if (Array.isArray(ids) && ids.length > 0) {
    return { exists: true, id: ids[0] };
  }

  return { exists: false };
}

async function getDocTreeHelper(client, notebookId, hPath = "/", maxDepth = 3) {
  let startPath = "/";

  if (hPath && hPath !== "/") {
    const ids = await getIdsByHPath(client, notebookId, hPath);
    if (!Array.isArray(ids) || ids.length === 0) {
      return [];
    }

    const pathInfo = await getPathByID(client, ids[0]);
    startPath = pathInfo.path;
  }

  const buildTree = async (currentPath, depth) => {
    if (depth > maxDepth) {
      return [];
    }

    const result = await listDocsByPath(client, notebookId, currentPath);
    const files = Array.isArray(result?.files) ? result.files : [];
    const nodes = [];

    for (const file of files) {
      const node = {
        id: file.id,
        name: file.name,
        path: file.path,
        hPath: file.hPath ?? "",
        children: [],
      };

      if (depth < maxDepth) {
        node.children = await buildTree(file.path, depth + 1);
      }

      nodes.push(node);
    }

    return nodes;
  };

  return buildTree(startPath, 1);
}

export const ACTIONS = {
  list_notebooks: async ({ client }) => {
    const result = await client.request("/api/notebook/lsNotebooks");
    const notebooks = Array.isArray(result?.notebooks) ? result.notebooks : [];

    return createSuccessResult("list_notebooks", {
      summary: `已获取 ${notebooks.length} 个笔记本`,
      text: formatNotebookList(notebooks),
      data: result,
      meta: { count: notebooks.length },
    });
  },

  create_notebook: async ({ client }, params) => {
    const name = requireNonEmptyString(params, "name", "name");
    const result = await client.request("/api/notebook/createNotebook", { name });

    return createSuccessResult("create_notebook", {
      summary: `笔记本已创建: ${name}`,
      text: toPrettyJson(result),
      data: result,
    });
  },

  remove_notebook: async ({ client }, params) => {
    const notebookId = requireNonEmptyString(params, "notebookId", "notebookId");
    await client.request("/api/notebook/removeNotebook", { notebook: notebookId });

    return createSuccessResult("remove_notebook", {
      summary: `笔记本已删除: ${notebookId}`,
      text: `笔记本已删除: ${notebookId}`,
    });
  },

  rename_notebook: async ({ client }, params) => {
    const notebookId = requireNonEmptyString(params, "notebookId", "notebookId");
    const name = requireNonEmptyString(params, "name", "name");
    await client.request("/api/notebook/renameNotebook", { notebook: notebookId, name });

    return createSuccessResult("rename_notebook", {
      summary: `笔记本已重命名为 ${name}`,
      text: `笔记本 ${notebookId} 已重命名为 ${name}`,
    });
  },

  open_notebook: async ({ client }, params) => {
    const notebookId = requireNonEmptyString(params, "notebookId", "notebookId");
    await client.request("/api/notebook/openNotebook", { notebook: notebookId });

    return createSuccessResult("open_notebook", {
      summary: `笔记本已打开: ${notebookId}`,
      text: `笔记本已打开: ${notebookId}`,
    });
  },

  close_notebook: async ({ client }, params) => {
    const notebookId = requireNonEmptyString(params, "notebookId", "notebookId");
    await client.request("/api/notebook/closeNotebook", { notebook: notebookId });

    return createSuccessResult("close_notebook", {
      summary: `笔记本已关闭: ${notebookId}`,
      text: `笔记本已关闭: ${notebookId}`,
    });
  },

  get_notebook_conf: async ({ client }, params) => {
    const notebookId = requireNonEmptyString(params, "notebookId", "notebookId");
    const result = await client.request("/api/notebook/getNotebookConf", { notebook: notebookId });

    return createSuccessResult("get_notebook_conf", {
      summary: `已获取笔记本配置: ${notebookId}`,
      text: toPrettyJson(result),
      data: result,
    });
  },

  create_doc_with_md: async ({ client }, params) => {
    const notebookId = requireNonEmptyString(params, "notebookId", "notebookId");
    const path = ensureAbsolutePath(requireNonEmptyString(params, "path", "path"));
    const markdown = requireString(params, "markdown", "markdown");
    const parentPath = getParentPath(path);
    const parentCheck = await checkPathExistsHelper(client, notebookId, parentPath);
    const docId = await client.request("/api/filetree/createDocWithMd", {
      notebook: notebookId,
      path,
      markdown,
    });

    const warnings = [];
    if (parentPath !== "/") {
      if (parentCheck.exists) {
        warnings.push(`请在父目录 ${parentPath} 中追加超链接: ((${docId} \"显示文本\"))`);
      } else {
        warnings.push(`父路径 ${parentPath} 在创建前不存在，请确认是否符合预期。`);
      }
    }

    return createSuccessResult("create_doc_with_md", {
      summary: `文档已创建: ${path}`,
      text: [`文档 ID: ${docId}`, `路径: ${path}`, `父路径: ${parentPath}`].join("\n"),
      data: {
        id: docId,
        path,
        parentPath,
        parentExists: parentCheck.exists,
        parentId: parentCheck.id ?? null,
      },
      warnings,
    });
  },

  rename_doc: async ({ client }, params) => {
    const id = requireNonEmptyString(params, "id", "id");
    const title = requireNonEmptyString(params, "title", "title");
    await client.request("/api/filetree/renameDocByID", { id, title });

    return createSuccessResult("rename_doc", {
      summary: `文档已重命名为 ${title}`,
      text: `文档 ${id} 已重命名为 ${title}`,
    });
  },

  remove_doc: async ({ client }, params) => {
    const id = requireNonEmptyString(params, "id", "id");
    await client.request("/api/filetree/removeDocByID", { id });

    return createSuccessResult("remove_doc", {
      summary: `文档已删除: ${id}`,
      text: `文档已删除: ${id}`,
    });
  },

  move_docs: async ({ client }, params) => {
    const fromIDs = requireStringArray(params, "fromIDs", "fromIDs");
    const toID = requireNonEmptyString(params, "toID", "toID");
    await client.request("/api/filetree/moveDocsByID", { fromIDs, toID });

    return createSuccessResult("move_docs", {
      summary: `已移动 ${fromIDs.length} 个文档`,
      text: `目标位置: ${toID}`,
      data: { fromIDs, toID },
    });
  },

  get_doc_path: async ({ client }, params) => {
    const id = requireNonEmptyString(params, "id", "id");
    const hPath = await client.request("/api/filetree/getHPathByID", { id });

    return createSuccessResult("get_doc_path", {
      summary: `已获取文档路径: ${id}`,
      text: hPath,
      data: { id, hPath },
    });
  },

  export_md_content: async ({ client }, params) => {
    const id = requireNonEmptyString(params, "id", "id");
    const result = await client.request("/api/export/exportMdContent", { id });

    return createSuccessResult("export_md_content", {
      summary: `已导出 Markdown 内容: ${id}`,
      text: result?.content ?? "",
      data: result,
      meta: {
        hPath: result?.hPath ?? null,
        contentLength: typeof result?.content === "string" ? result.content.length : 0,
      },
    });
  },

  insert_block: async ({ client }, params) => {
    const dataType = requireBlockDataType(params);
    const data = requireString(params, "data", "data");
    const nextID = optionalString(params, "nextID");
    const previousID = optionalString(params, "previousID");
    const parentID = optionalString(params, "parentID");

    if (!nextID && !previousID && !parentID) {
      throw new Error("insert_block 至少需要提供 nextID、previousID、parentID 之一");
    }

    const result = await client.request("/api/block/insertBlock", {
      dataType,
      data,
      nextID,
      previousID,
      parentID,
    });
    const blockId = extractFirstOperationId(result);

    return createSuccessResult("insert_block", {
      summary: blockId ? `块已插入: ${blockId}` : "块已插入",
      text: blockId ? `新块 ID: ${blockId}` : toPrettyJson(result),
      data: result,
    });
  },

  prepend_block: async ({ client }, params) => {
    const dataType = requireBlockDataType(params);
    const data = requireString(params, "data", "data");
    const parentID = requireNonEmptyString(params, "parentID", "parentID");
    const result = await client.request("/api/block/prependBlock", {
      dataType,
      data,
      parentID,
    });
    const blockId = extractFirstOperationId(result);

    return createSuccessResult("prepend_block", {
      summary: blockId ? `块已插入: ${blockId}` : "块已插入",
      text: blockId ? `新块 ID: ${blockId}` : toPrettyJson(result),
      data: result,
    });
  },

  append_block: async ({ client }, params) => {
    const dataType = requireBlockDataType(params);
    const data = requireString(params, "data", "data");
    const parentID = requireNonEmptyString(params, "parentID", "parentID");
    const result = await client.request("/api/block/appendBlock", {
      dataType,
      data,
      parentID,
    });
    const blockId = extractFirstOperationId(result);

    return createSuccessResult("append_block", {
      summary: blockId ? `块已追加: ${blockId}` : "块已追加",
      text: blockId ? `新块 ID: ${blockId}` : toPrettyJson(result),
      data: result,
    });
  },

  update_block: async ({ client }, params) => {
    const dataType = requireBlockDataType(params);
    const data = requireString(params, "data", "data");
    const id = requireNonEmptyString(params, "id", "id");
    const result = await client.request("/api/block/updateBlock", {
      dataType,
      data,
      id,
    });

    return createSuccessResult("update_block", {
      summary: `块已更新: ${id}`,
      text: `块已更新: ${id}`,
      data: result,
    });
  },

  delete_block: async ({ client }, params) => {
    const id = requireNonEmptyString(params, "id", "id");
    const result = await client.request("/api/block/deleteBlock", { id });

    return createSuccessResult("delete_block", {
      summary: `块已删除: ${id}`,
      text: `块已删除: ${id}`,
      data: result,
    });
  },

  move_block: async ({ client }, params) => {
    const id = requireNonEmptyString(params, "id", "id");
    const previousID = optionalString(params, "previousID");
    const parentID = optionalString(params, "parentID");

    if (!previousID && !parentID) {
      throw new Error("move_block 至少需要提供 previousID 或 parentID 之一");
    }

    const result = await client.request("/api/block/moveBlock", {
      id,
      previousID,
      parentID,
    });

    return createSuccessResult("move_block", {
      summary: `块已移动: ${id}`,
      text: `块已移动: ${id}`,
      data: result,
    });
  },

  get_block_kramdown: async ({ client }, params) => {
    const id = requireNonEmptyString(params, "id", "id");
    const result = await client.request("/api/block/getBlockKramdown", { id });

    return createSuccessResult("get_block_kramdown", {
      summary: `已获取块 Kramdown: ${id}`,
      text: result?.kramdown ?? toPrettyJson(result),
      data: result,
    });
  },

  get_child_blocks: async ({ client }, params) => {
    const id = requireNonEmptyString(params, "id", "id");
    const result = await client.request("/api/block/getChildBlocks", { id });

    return createSuccessResult("get_child_blocks", {
      summary: `已获取子块列表: ${id}`,
      text: formatChildBlocks(result),
      data: result,
      meta: { count: Array.isArray(result) ? result.length : 0 },
    });
  },

  set_block_attrs: async ({ client }, params) => {
    const id = requireNonEmptyString(params, "id", "id");
    const attrs = requireRecordOfStrings(params, "attrs", "attrs");
    await client.request("/api/attr/setBlockAttrs", { id, attrs });

    return createSuccessResult("set_block_attrs", {
      summary: `块属性已设置: ${id}`,
      text: `块属性已设置: ${id}`,
      data: { id, attrs },
    });
  },

  get_block_attrs: async ({ client }, params) => {
    const id = requireNonEmptyString(params, "id", "id");
    const result = await client.request("/api/attr/getBlockAttrs", { id });

    return createSuccessResult("get_block_attrs", {
      summary: `已获取块属性: ${id}`,
      text: formatKeyValueMap(result),
      data: result,
    });
  },

  sql_query: async ({ client }, params) => {
    const sql = requireNonEmptyString(params, "sql", "sql");
    const allowWrite = params.allowWrite === true;

    if (hasPotentialWriteSql(sql) && !allowWrite) {
      throw new Error("检测到可能带副作用的 SQL。只有在用户已明确授权时，才可设置 params.allowWrite=true 后执行。");
    }

    const result = await client.request("/api/query/sql", { stmt: sql });
    const warnings = allowWrite ? ["本次 SQL 以 allowWrite=true 执行，请确认这符合用户明确授权。"] : [];

    return createSuccessResult("sql_query", {
      summary: `SQL 查询已执行，返回 ${Array.isArray(result) ? result.length : 0} 条结果`,
      text: formatRows(result),
      data: result,
      warnings,
      meta: { count: Array.isArray(result) ? result.length : 0 },
    });
  },

  fulltext_search: async ({ client, config }, params) => {
    const keyword = requireNonEmptyString(params, "keyword", "keyword");
    const limit = normalizeLimit(params.limit, config.defaultLimit, config.maxLimit);
    const safeKeyword = escapeLikeKeyword(keyword);
    const sql = `SELECT * FROM blocks WHERE content LIKE '%${safeKeyword}%' ESCAPE '\\' LIMIT ${limit}`;
    const result = await client.request("/api/query/sql", { stmt: sql });

    return createSuccessResult("fulltext_search", {
      summary: `全文搜索完成，返回 ${Array.isArray(result) ? result.length : 0} 条结果`,
      text: formatRows(result),
      data: result,
      meta: {
        keyword,
        limit,
        count: Array.isArray(result) ? result.length : 0,
      },
    });
  },

  get_doc_tree: async ({ client }, params) => {
    const notebookId = requireNonEmptyString(params, "notebookId", "notebookId");
    const path = params.path === undefined ? "/" : ensureAbsolutePath(requireNonEmptyString(params, "path", "path"));
    const maxDepth = normalizeMaxDepth(params.maxDepth, 3);
    const tree = await getDocTreeHelper(client, notebookId, path, maxDepth);

    return createSuccessResult("get_doc_tree", {
      summary: `已获取文档树: ${path}`,
      text: formatDocTree(tree),
      data: tree,
      meta: {
        notebookId,
        path,
        maxDepth,
        count: countDocTreeNodes(tree),
      },
    });
  },

  check_path_exists: async ({ client }, params) => {
    const notebookId = requireNonEmptyString(params, "notebookId", "notebookId");
    const path = ensureAbsolutePath(requireNonEmptyString(params, "path", "path"));
    const result = await checkPathExistsHelper(client, notebookId, path);

    return createSuccessResult("check_path_exists", {
      summary: result.exists ? `路径存在: ${path}` : `路径不存在: ${path}`,
      text: result.exists ? `路径存在，ID: ${result.id}` : `路径不存在: ${path}`,
      data: {
        notebookId,
        path,
        ...result,
      },
    });
  },

  get_version: async ({ client }) => {
    const version = await client.request("/api/system/version");

    return createSuccessResult("get_version", {
      summary: `思源版本: ${version}`,
      text: String(version),
      data: { version },
    });
  },

  push_msg: async ({ client }, params) => {
    const msg = requireNonEmptyString(params, "msg", "msg");
    const timeout = params.timeout === undefined ? undefined : normalizeLimit(params.timeout, 7000, 600000);
    const result = await client.request("/api/notification/pushMsg", {
      msg,
      timeout,
    });

    return createSuccessResult("push_msg", {
      summary: "消息已推送",
      text: result?.id ? `消息 ID: ${result.id}` : toPrettyJson(result),
      data: result,
    });
  },
};

export const ACTION_NAMES = Object.keys(ACTIONS).sort();
