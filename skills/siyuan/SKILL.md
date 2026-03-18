---
name: siyuan
description: 通过本地 Node 脚本直连思源 HTTP API。推荐传入 JSON，兼容自然语言入口。
disable-model-invocation: true
argument-hint: "[JSON参数或自然语言指令]"
---

# SiYuan Direct API Skill

你正在作为 `/siyuan` 的执行入口工作。

这是一个直接调用思源 HTTP API 的 skill。
你可以理解、归一化并补齐自然语言入口，但只有在拿到最终结构化 JSON 且风险边界明确之后，才执行本地脚本。
真正的执行路径是：

1. 读取用户传入的 `$ARGUMENTS`
2. 将输入归一化为统一 JSON 协议：`{"action":"...","params":{...}}`
3. 在参数齐全且安全边界明确后，使用本地脚本直连思源 HTTP API
4. 脚本路径固定为 `${CLAUDE_SKILL_DIR}/scripts/invoke.mjs`

## 安全原则

- 绝不要在回复、命令参数、日志中写出或回显思源 Token。
- 绝不要把 Token 放进 slash 参数、JSON 参数、命令行参数。
- Token 只允许来自以下位置：
  1. 环境变量 `SIYUAN_TOKEN`
  2. `${CLAUDE_SKILL_DIR}/config/siyuan.config.local.json`
- 如无特殊原因，优先建议用户使用环境变量保存真实 Token；本地配置文件仅限本机私有使用，不应进入版本控制或共享目录。
- 地址优先从环境变量 `SIYUAN_BASE_URL` / `SIYUAN_API_URL` 读取，其次才是本地配置文件。
- 默认只允许连接本地思源地址；若用户确实要连接远程地址，必须由用户自己在本地配置或环境变量中显式开启 `allowRemote` / `SIYUAN_ALLOW_REMOTE`。
- 如果配置缺失，只告诉用户去填写 `${CLAUDE_SKILL_DIR}/config/siyuan.config.local.json` 或设置环境变量；不要展示配置文件内容，更不要猜测 secret。
- 不要虚构任何 `notebookId`、`id`、`path`、`sql`、`markdown`、`attrs`。

## 输入协议

输入来自：

`$ARGUMENTS`

### 方式 1：JSON 参数（推荐）

如果 `$ARGUMENTS` 能解析为 JSON，对象结构必须是：

```json
{"action":"get_doc_tree","params":{"notebookId":"...","path":"/2026工作日记","maxDepth":2}}
```

处理规则：

1. 校验根节点是对象
2. 校验 `action` 是非空字符串
3. 校验 `params` 是对象
4. 缺参数时先追问，不要猜值
5. 参数齐全后再执行脚本

### 方式 2：自然语言指令

如果 `$ARGUMENTS` 不是 JSON，则把它视为自然语言入口，例如：

- `列出所有笔记本`
- `检查 /2026工作日记/2026-03 是否存在`
- `导出这个文档的 Markdown，id 是 20250317123456-abc123`

处理规则：

1. 先把自然语言归一化为 `action + params`
2. 只有在语义明确、关键参数齐全时才执行
3. 缺关键参数时先问用户
4. 删除、移动、覆盖、写 SQL 等高风险操作先确认
5. 对有副作用的 action，只有在用户已明确确认后，才可在最终 JSON 中加入 `params.confirmed=true`
6. 脚本本身只接收结构化 JSON，不把自然语言直接交给脚本

## 支持的 action

- `list_notebooks`
- `create_notebook`
- `remove_notebook`
- `rename_notebook`
- `open_notebook`
- `close_notebook`
- `get_notebook_conf`
- `create_doc_with_md`
- `rename_doc`
- `remove_doc`
- `move_docs`
- `get_doc_path`
- `export_md_content`
- `insert_block`
- `prepend_block`
- `append_block`
- `update_block`
- `delete_block`
- `move_block`
- `get_block_kramdown`
- `get_child_blocks`
- `set_block_attrs`
- `get_block_attrs`
- `sql_query`
- `fulltext_search`
- `get_doc_tree`
- `check_path_exists`
- `get_version`
- `push_msg`

## 风险边界

以下 action 默认视为有副作用，若用户意图不够明确，先确认：

- 只有在用户已明确确认后，才可在最终 JSON 中加入 `params.confirmed=true`

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

对于 `sql_query`：

- 默认只接受明确授权的 SQL
- 若 SQL 涉及 `insert/update/delete/replace/alter/drop/create/truncate` 等写操作，必须先确认
- 只有在用户已明确授权时，才可在最终 JSON 中同时加入 `params.allowWrite=true` 与 `params.confirmed=true`
- 不要把自然语言自动扩写成有副作用 SQL

## 执行脚本的方法

当且仅当你已经拿到最终的结构化 payload 时，使用 Bash 调用本地脚本。

始终使用 heredoc 通过标准输入传 JSON，避免 shell 转义问题，也避免 payload 出现在命令行参数中。

示例：

```bash
node "${CLAUDE_SKILL_DIR}/scripts/invoke.mjs" <<'EOF'
{"action":"get_version","params":{}}
EOF
```

再例如：

```bash
node "${CLAUDE_SKILL_DIR}/scripts/invoke.mjs" <<'EOF'
{"action":"check_path_exists","params":{"notebookId":"your-notebook-id","path":"/2026工作日记/2026-03"}}
EOF
```

不要：

- 不要把 Token 放进命令行参数
- 不要把 payload JSON 放进命令行参数
- 不要把地址和 Token 内联到命令中
- 不要把自然语言原文直接传给脚本

## 如何解读脚本输出

脚本输出 JSON，核心字段通常包括：

- `ok`
- `action`
- `summary`
- `text`
- `data`
- `warnings`
- `meta`

处理规则：

- `ok: true` 时，优先向用户返回 `summary` 和关键结果
- 若 `warnings` 非空，要一并提示用户
- `ok: false` 时，直接说明失败原因，不要编造补救结果
- 仅在用户明确需要时再展开完整 `data`

## 特殊规则

### `create_doc_with_md`

执行成功后，脚本会返回父路径检查结果与提醒信息。
如果返回了“需要在父目录追加超链接”的提醒，必须一并告知用户。

### `fulltext_search`

- 使用结构化参数：`keyword`、可选 `limit`
- 不要手写不受控的 limit
- 结果数量由脚本内部限幅

### `get_doc_tree`

- `path` 缺省时可视为 `/`
- `maxDepth` 缺省时可使用默认值
- 若用户要“先看看目录结构”，优先用这个 action

### `check_path_exists`

- 在创建文档前，若用户关心父目录是否存在，优先调用它
- 不要把“接口失败”说成“路径不存在”，以脚本返回为准

## 推荐工作流

1. 读取 `$ARGUMENTS`
2. 判断是 JSON 还是自然语言
3. 归一化为最终 payload
4. 校验参数与风险边界
5. 用 Bash 调 `${CLAUDE_SKILL_DIR}/scripts/invoke.mjs`
6. 读取脚本返回 JSON
7. 用简洁中文向用户汇报结果

## 示例

### 示例 1：JSON 直调

```text
/siyuan {"action":"list_notebooks","params":{}}
```

### 示例 2：自然语言入口

```text
/siyuan 列出所有笔记本
```

### 示例 3：检查路径

```text
/siyuan {"action":"check_path_exists","params":{"notebookId":"...","path":"/2026工作日记/2026-03"}}
```

### 示例 4：导出 Markdown

```text
/siyuan {"action":"export_md_content","params":{"id":"20250317123456-abc123"}}
```
