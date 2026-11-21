# 外部管理接口

项目提供 **MCP Streamable HTTP / JSON-RPC** 管理接口，可用于支持远程 MCP 的 AI 客户端，也可以由脚本调用。它不是 `/api/bookmarks` 风格的 REST CRUD；站内表单使用的 Next.js Server Actions 不是稳定的对外接口。

## 启用与认证

1. 登录后台，打开「设置 → MCP」。启用 MCP，按客户端用途生成专用 Bearer Token 或 OAuth 客户端凭据。凭据只在生成时显示，可撤销。
2. MCP 地址为 `<站点网址>/api/mcp`。本机预览可以用 `http://127.0.0.1:3000/api/mcp`；外部接入请配置正确的 `PUBLIC_BASE_URL`，使用 HTTPS。该本机地址不能直接从其他机器访问。
3. Bearer 方式直接发送 `Authorization: Bearer <Token>`。OAuth 方式向 `POST /api/oauth/token` 发送表单 `grant_type=client_credentials`，使用客户端 ID/Secret（HTTP Basic 或表单字段，二者不可混用），之后用返回的 `access_token` 作为 Bearer。此流程不包含浏览器交互登录。

权限：`read` 读取公开数据，`read_private` 允许访问非公开数据，`write` 允许写入，`delete` 允许永久删除。建议为每个客户端单独创建最小权限凭据，不要把密钥放入前端代码。

## JSON-RPC 示例

先初始化，再用 `tools/list` 查当前凭据可用的工具和参数结构。客户端完成初始化后可发 `notifications/initialized`。以下示例以协议 `2025-11-25` 为例，后续请求应使用初始化响应返回的版本。

```http
POST /api/mcp
Content-Type: application/json
Accept: application/json, text/event-stream
Authorization: Bearer <Token>

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"my-integration","version":"1.0.0"}}}
```

查询书签示例（同一端点，携带认证和协商后的 `MCP-Protocol-Version` 请求头）：

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_bookmarks","arguments":{"limit":20}}}
```

常用工具包括 `list_bookmarks`、`add_bookmark`、`update_bookmark`、`hide_bookmark`、`reorder_bookmark`、`list_categories`、`add_category`、`update_category`、`hide_category` 和 `reorder_category`。永久删除另需删除权限及逐条确认；不支持递归删除分类。未启用时端点返回 404；启用后缺少有效凭据时返回 401。工具调用失败时检查结果中的 `isError`，不要仅依赖 HTTP 状态码。
