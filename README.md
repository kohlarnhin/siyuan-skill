# siyuan-skill

一个可通过 GitHub / git 分发的 Claude Code plugin，提供 `/siyuan-mcp` skill，直接请求 SiYuan HTTP API，不依赖 MCP server。

## 目录结构

- `.claude-plugin/marketplace.json`：让该仓库可作为 marketplace 添加
- `.claude-plugin/plugin.json`：plugin 清单
- `skills/siyuan-mcp/`：skill、本地脚本与配置模板

## 安装思路

将该 GitHub 仓库作为 Claude Code marketplace 添加后，安装其中的 `siyuan-skill` plugin。

## 配置

请自行在本机私有环境中配置思源地址和 Token：

- 推荐：使用环境变量
  - `SIYUAN_BASE_URL` 或 `SIYUAN_API_URL`
  - `SIYUAN_TOKEN`
- 备选：复制并填写本地私有配置文件
  - `skills/siyuan-mcp/config/siyuan.config.example.json`
  - 到 `skills/siyuan-mcp/config/siyuan.config.local.json`

注意：

- 不要把真实 Token 提交到仓库
- 默认仅允许本地思源地址；如需远程地址，需显式开启 `allowRemote` 或 `SIYUAN_ALLOW_REMOTE`

## 调用示例

```text
/siyuan-mcp {"action":"get_version","params":{}}
```

```text
/siyuan-mcp {"action":"list_notebooks","params":{}}
```

```text
/siyuan-mcp 列出所有笔记本
```
