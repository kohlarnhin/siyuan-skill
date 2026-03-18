# siyuan-skill

一个面向任意 AI / Agent 的 **SiYuan HTTP API 调用指南仓库**。

它不是某个特定平台的插件，也不绑定 Claude Code、MCP、slash command 或某个专用运行时。它的定位很简单：

- 给 AI 一份可直接遵循的操作文档
- 让 AI 把自然语言需求归一化为结构化请求
- 再由 AI 安全地请求 SiYuan HTTP API

## 仓库定位

这个仓库适合以下场景：

- 你想让任意 AI 助手操作思源
- 你需要一份统一的提示词/执行规范
- 你希望 AI 自动完成参数整理、接口调用、结果汇报

这个仓库**不提供特定客户端插件实现**。
它提供的是：

- 输入协议
- 安全边界
- action 语义
- API 映射关系
- AI 调用步骤

## 如何使用

把本 README 当作以下任一种内容使用即可：

- AI 的 system prompt
- AI 的 skill / tool guide
- Agent 的执行规范文档
- 你的自定义 AI 工具链中的参考手册

核心目标是让 AI 先把用户请求整理成统一结构：

```json
{"action":"...","params":{...}}
```

然后再根据 action 去调用对应的 SiYuan HTTP API。

---

## 配置约定

为了避免 secret 泄露，建议 AI 运行环境自行提供以下配置：

- `SIYUAN_BASE_URL` 或 `SIYUAN_API_URL`
- `SIYUAN_TOKEN`
- 可选：`SIYUAN_ALLOW_REMOTE`
- 可选：`SIYUAN_TIMEOUT_MS`
- 可选：`SIYUAN_DEFAULT_LIMIT`
- 可选：`SIYUAN_MAX_LIMIT`

### 安全要求

- 不要在提示词、日志、命令行参数中回显 Token
- 不要让 AI 猜测 Token、notebookId、id、path、sql、attrs
- 默认只允许连接本地思源地址
- 如果必须连接远程思源地址，必须由用户显式授权，且必须使用 `https://`
- 不要把自然语言直接拼接成高风险 SQL 或写操作请求

---

## 输入协议

### 方式 1：结构化 JSON（推荐）

```json
{"action":"get_doc_tree","params":{"notebookId":"...","path":"/2026工作日记","maxDepth":2}}
```

规则：

1. 根节点必须是对象
2. `action` 必须是非空字符串
3. `params` 必须是对象
4. 缺参数时先追问，不要猜值
5. 参数齐全后再发起请求

### 方式 2：自然语言入口

示例：

- `列出所有笔记本`
- `检查 /2026工作日记/2026-03 是否存在`
- `导出这个文档的 Markdown，id 是 20250317123456-abc123`

规则：

1. 先把自然语言归一化为 `action + params`
2. 只有在语义明确、关键参数齐全时才执行
3. 缺关键参数时先问用户
4. 删除、移动、覆盖、写 SQL 等高风险操作先确认
5. 对有副作用的 action，只有在用户已明确确认后，才可在最终 JSON 中加入 `params.confirmed=true`
6. 对写 SQL，只有在用户已明确授权时，才可同时加入 `params.allowWrite=true` 与 `params.confirmed=true`

---

## 建议的 HTTP 调用方式

AI 在实际请求 SiYuan API 时，建议遵循以下约定：

- Method: `POST`
- Header:
  - `Content-Type: application/json`
  - `Authorization: Token <token>`
- Body: JSON
- 返回结果需校验：
  - HTTP 状态码成功
  - 响应 JSON 可解析
  - `code === 0`

如果接口失败：

- 不要把“接口失败”误报成“路径不存在”
- 不要编造成功结果
- 应直接向用户说明失败原因

---

## 输出约定

建议 AI 在请求完成后向上层返回统一结果结构：

```json
{
  "ok": true,
  "action": "list_notebooks",
  "summary": "已获取 3 个笔记本",
  "text": "1. 工作 (notebook-id) [open]",
  "data": {},
  "warnings": [],
  "meta": {}
}
```

建议规则：

- `ok: true` 时优先返回 `summary` 和关键结果
- `warnings` 非空时要一并提示用户
- `ok: false` 时直接说明失败原因
- 仅在用户明确需要时再展开完整 `data`

---

## 支持的 action

### notebook

- `list_notebooks`
- `create_notebook`
- `remove_notebook`
- `rename_notebook`
- `open_notebook`
- `close_notebook`
- `get_notebook_conf`

### doc / filetree

- `create_doc_with_md`
- `rename_doc`
- `remove_doc`
- `move_docs`
- `get_doc_path`
- `get_doc_tree`
- `check_path_exists`

### export

- `export_md_content`

### block

- `insert_block`
- `prepend_block`
- `append_block`
- `update_block`
- `delete_block`
- `move_block`
- `get_block_kramdown`
- `get_child_blocks`

### attr

- `set_block_attrs`
- `get_block_attrs`

### query

- `sql_query`
- `fulltext_search`

### system / notification

- `get_version`
- `push_msg`

---

## 风险边界

以下 action 默认视为有副作用：

- `create_notebook`
- `remove_notebook`
- `rename_notebook`
- `open_notebook`
- `close_notebook`
- `create_doc_with_md`
- `rename_doc`
- `remove_doc`
- `move_docs`
- `insert_block`
- `prepend_block`
- `append_block`
- `update_block`
- `delete_block`
- `move_block`
- `set_block_attrs`
- `push_msg`

执行这些 action 前，AI 应满足：

- 用户意图明确
- 关键参数齐全
- 已获得明确确认
- 最终结构化参数里显式带上 `params.confirmed=true`

### `sql_query` 额外规则

- 默认只接受明确授权的 SQL
- 若 SQL 涉及 `insert/update/delete/replace/alter/drop/create/truncate` 等写操作，必须先确认
- 只有在用户已明确授权时，才可同时加入 `params.allowWrite=true` 与 `params.confirmed=true`
- 缺少任一字段都应拒绝执行写 SQL
- 不要把自然语言自动扩写成有副作用 SQL

---

## action 与 SiYuan API 映射

### 直接映射

下表区分两层语义：

- `action params`：AI 内部统一协议使用的字段
- `HTTP body`：真正发送给 SiYuan HTTP API 的 JSON 字段

| action | endpoint | action params | HTTP body |
|---|---|---|---|
| `list_notebooks` | `/api/notebook/lsNotebooks` | 无 | `{}` |
| `create_notebook` | `/api/notebook/createNotebook` | `name` | `{ "name": name }` |
| `remove_notebook` | `/api/notebook/removeNotebook` | `notebookId` | `{ "notebook": notebookId }` |
| `rename_notebook` | `/api/notebook/renameNotebook` | `notebookId`, `name` | `{ "notebook": notebookId, "name": name }` |
| `open_notebook` | `/api/notebook/openNotebook` | `notebookId` | `{ "notebook": notebookId }` |
| `close_notebook` | `/api/notebook/closeNotebook` | `notebookId` | `{ "notebook": notebookId }` |
| `get_notebook_conf` | `/api/notebook/getNotebookConf` | `notebookId` | `{ "notebook": notebookId }` |
| `create_doc_with_md` | `/api/filetree/createDocWithMd` | `notebookId`, `path`, `markdown` | `{ "notebook": notebookId, "path": path, "markdown": markdown }` |
| `rename_doc` | `/api/filetree/renameDocByID` | `id`, `title` | `{ "id": id, "title": title }` |
| `remove_doc` | `/api/filetree/removeDocByID` | `id` | `{ "id": id }` |
| `move_docs` | `/api/filetree/moveDocsByID` | `fromIDs`, `toID` | `{ "fromIDs": fromIDs, "toID": toID }` |
| `get_doc_path` | `/api/filetree/getHPathByID` | `id` | `{ "id": id }` |
| `export_md_content` | `/api/export/exportMdContent` | `id` | `{ "id": id }` |
| `insert_block` | `/api/block/insertBlock` | `dataType`, `data`, `nextID/previousID/parentID` | `{ "dataType": dataType, "data": data, "nextID": nextID, "previousID": previousID, "parentID": parentID }` |
| `prepend_block` | `/api/block/prependBlock` | `dataType`, `data`, `parentID` | `{ "dataType": dataType, "data": data, "parentID": parentID }` |
| `append_block` | `/api/block/appendBlock` | `dataType`, `data`, `parentID` | `{ "dataType": dataType, "data": data, "parentID": parentID }` |
| `update_block` | `/api/block/updateBlock` | `dataType`, `data`, `id` | `{ "dataType": dataType, "data": data, "id": id }` |
| `delete_block` | `/api/block/deleteBlock` | `id` | `{ "id": id }` |
| `move_block` | `/api/block/moveBlock` | `id`, `previousID/parentID` | `{ "id": id, "previousID": previousID, "parentID": parentID }` |
| `get_block_kramdown` | `/api/block/getBlockKramdown` | `id` | `{ "id": id }` |
| `get_child_blocks` | `/api/block/getChildBlocks` | `id` | `{ "id": id }` |
| `set_block_attrs` | `/api/attr/setBlockAttrs` | `id`, `attrs` | `{ "id": id, "attrs": attrs }` |
| `get_block_attrs` | `/api/attr/getBlockAttrs` | `id` | `{ "id": id }` |
| `sql_query` | `/api/query/sql` | `sql` | `{ "stmt": sql }` |
| `get_version` | `/api/system/version` | 无 | `{}` |
| `push_msg` | `/api/notification/pushMsg` | `msg`, `timeout` | `{ "msg": msg, "timeout": timeout }` |

### 组合 action

这些 action 不是单一 endpoint，而是 AI 侧的组合逻辑：

#### `check_path_exists`

建议流程：

1. 调 `/api/filetree/getIDsByHPath`
2. HTTP body 使用 `{ "notebook": notebookId, "path": path }`
3. 根据返回 ID 列表判断路径是否存在
4. 若存在，返回首个 ID

#### `get_doc_tree`

建议流程：

1. 若 `path !== "/"`，先调 `/api/filetree/getIDsByHPath`
2. `getIDsByHPath` 的 HTTP body 使用 `{ "notebook": notebookId, "path": path }`
3. 再调 `/api/filetree/getPathByID`，HTTP body 使用 `{ "id": id }`
4. 递归调 `/api/filetree/listDocsByPath`
5. `listDocsByPath` 的 HTTP body 使用 `{ "notebook": notebookId, "path": currentPath }`
6. 组装树形结果

#### `fulltext_search`

建议流程：

1. 对关键字做 SQL LIKE 转义
2. 组装查询语句
3. 通过 `/api/query/sql` 执行
4. 对 `limit` 做限幅，不要使用不受控 limit

---

## 特殊规则

### `create_doc_with_md`

创建成功后，建议 AI 额外检查父路径状态，并提醒用户是否需要在父目录补超链接。

超链接格式示例：

```text
((文档ID "显示文本"))
```

### `insert_block`

至少需要提供以下定位参数之一：

- `nextID`
- `previousID`
- `parentID`

### `move_block`

至少需要提供以下参数之一：

- `previousID`
- `parentID`

### `set_block_attrs`

`attrs` 应为对象，且 value 应为字符串。

---

## 推荐执行流程

1. 读取用户原始输入
2. 判断是 JSON 还是自然语言
3. 归一化为最终 payload：`{"action":"...","params":{...}}`
4. 校验参数、权限边界与风险边界
5. 组装对应的 SiYuan HTTP 请求
6. 校验接口响应
7. 生成统一结果并回复用户

---

## 通用示例

### 示例 1：列出所有笔记本

归一化结果：

```json
{"action":"list_notebooks","params":{}}
```

### 示例 2：检查路径是否存在

归一化结果：

```json
{"action":"check_path_exists","params":{"notebookId":"...","path":"/2026工作日记/2026-03"}}
```

### 示例 3：导出 Markdown

归一化结果：

```json
{"action":"export_md_content","params":{"id":"20250317123456-abc123"}}
```

### 示例 4：高风险写操作

只有在用户已明确确认后：

```json
{"action":"remove_doc","params":{"id":"...","confirmed":true}}
```

### 示例 5：写 SQL

只有在用户已明确授权后：

```json
{"action":"sql_query","params":{"sql":"DELETE FROM blocks WHERE id='...'","allowWrite":true,"confirmed":true}}
```
