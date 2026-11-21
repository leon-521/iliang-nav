import type { APIRequestContext, Page } from "@playwright/test";
import { expect, login, test } from "./helpers";

function send(request: APIRequestContext, token: string | undefined, method: string, params: Record<string, unknown> = {}, extra: Record<string, string> = {}) {
  return request.post("/api/mcp", { headers: { Accept:"application/json, text/event-stream", ...(token && {Authorization:`Bearer ${token}`}), ...extra }, data:{jsonrpc:"2.0", id:1, method, params} });
}
async function call(request: APIRequestContext, token: string, name: string, args: Record<string, unknown>) {
  const response = await send(request,token,"tools/call",{name,arguments:args});
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.error).toBeUndefined();
  return data.result;
}

async function mint(page: Page, label: string, scopes: string[], oauth = false) {
  await page.getByLabel("名称",{ exact:true }).fill(label);
  if (oauth) await page.getByLabel("认证方式").selectOption("oauth");
  for (const scope of scopes) await page.locator(`#mcp-scope-${scope}`).check();
  if (scopes.includes("delete")) await page.locator("#mcp-confirm-delete").check();
  await page.getByRole("button",{name:"生成凭据"}).click();
  const secret = page.getByLabel(oauth ? "Client Secret" : "Bearer Token",{exact:true});
  await expect(secret).toBeVisible();
  const value = await secret.inputValue();
  const id = oauth ? await page.getByLabel("Client ID",{exact:true}).inputValue() : "";
  await page.getByRole("button",{name:"已保存，隐藏密钥"}).click();
  await expect(secret).toHaveCount(0);
  return { value, id };
}
async function revoke(page: Page, label: string) {
  await page.getByRole("button",{name:`撤销 ${label}`,exact:true}).click();
  await page.getByRole("button",{name:"确认撤销",exact:true}).click();
  await expect(page.getByText("凭据已撤销。",{exact:true})).toBeVisible();
}

test("原生 MCP 默认关闭，验证范围、工具、永久删除与 OAuth 撤销", async ({page,request,jsErrors}) => {
  expect((await send(request,undefined,"tools/list")).status()).toBe(404);
  await login(page,"/settings");
  await page.getByRole("tab",{name:/MCP/i}).click();
  const enable = page.getByRole("button",{name:"启用 MCP",exact:true});
  await expect(enable).toBeEnabled();
  await enable.click();
  const disable = page.getByRole("button",{name:"停用 MCP",exact:true});
  await expect(disable).toBeVisible();
  try {
    expect((await send(request,undefined,"tools/list")).status()).toBe(401);
    const read = await mint(page,"只读 e2e",[]);
    const writer = await mint(page,"公开编辑 e2e",["write"]);
    const admin = await mint(page,"私有编辑 e2e",["read_private","write","delete"]);
    const oauth = await mint(page,"OAuth e2e",[],true);
    const init = await send(request,read.value,"initialize",{protocolVersion:"2025-11-25",capabilities:{},clientInfo:{name:"test",version:"1"}});
    expect(await init.json()).toMatchObject({result:{protocolVersion:"2025-11-25",capabilities:{tools:{}}}});
    expect((await send(request,read.value,"tools/list",{}, {Origin:"https://blocked.example.com"})).status()).toBe(403);
    const listing = await (await send(request,read.value,"tools/list")).json();
    expect(listing.result.tools.map((item:{name:string}) => item.name)).toEqual(["list_bookmarks","list_categories"]);
    expect((await call(request,read.value,"add_bookmark",{url:"https://e2e-mcp.example.net/"})).isError).toBe(true);
    const category = (await call(request,admin.value,"add_category",{name:"MCP e2e private"})).structuredContent.id;
    expect((await call(request,writer.value,"add_bookmark",{url:"https://e2e-mcp.example.net/",categoryId:category})).isError).toBe(true);
    const bookmark = (await call(request,admin.value,"add_bookmark",{url:"https://e2e-mcp.example.net/?utm_source=test",title:"MCP e2e bookmark", categoryId:category,tags:"MCP, 测试"})).structuredContent.id;
    expect((await call(request,writer.value,"update_bookmark",{id:bookmark,visibility:"public"})).isError).toBe(true);
    const privateRows = await call(request,admin.value,"list_bookmarks",{categoryId:category});
    expect(privateRows.structuredContent.items).toEqual([expect.objectContaining({id:bookmark,url:"https://e2e-mcp.example.net",tags:expect.arrayContaining(["MCP","测试"]),visibility:"private"})]);
    expect((await call(request,admin.value,"update_bookmark",{id:bookmark,title:"MCP e2e changed"})).structuredContent.id).toBe(bookmark);
    expect((await call(request,admin.value,"reorder_bookmark",{id:bookmark,sortOrder:16})).structuredContent.sortOrder).toBe(16);
    expect((await call(request,read.value,"list_bookmarks",{categoryId:category})).structuredContent.items).toEqual([]);
    expect((await call(request,admin.value,"delete_category",{id:category,confirmation:`DELETE:${category}`})).isError).toBe(true);
    expect((await call(request,admin.value,"delete_bookmark",{id:bookmark,confirmation:"unsafe"})).isError).toBe(true);
    expect((await call(request,admin.value,"delete_bookmark",{id:bookmark,confirmation:`DELETE:${bookmark}`})).structuredContent.id).toBe(bookmark);
    expect((await call(request,admin.value,"delete_category",{id:category,confirmation:`DELETE:${category}`})).structuredContent.id).toBe(category);
    const grant = (scope: string) => request.post("/api/oauth/token", {headers:{Authorization:`Basic ${Buffer.from(`${oauth.id}:${oauth.value}`).toString("base64")}`},form:{grant_type:"client_credentials",scope}});
    expect((await (await grant("write")).json()).error).toBe("invalid_scope");
    const issued = await (await grant("read")).json();
    expect(issued).toMatchObject({token_type:"Bearer",scope:"read",expires_in:600});
    expect((await send(request,issued.access_token,"tools/list")).status()).toBe(200);
    const authMeta = await request.get("/.well-known/oauth-authorization-server");
    expect(await authMeta.json()).toMatchObject({grant_types_supported:["client_credentials"]});
    expect((await request.get("/.well-known/oauth-protected-resource/api/mcp")).status()).toBe(200);
    await revoke(page,"OAuth e2e");
    expect((await send(request,issued.access_token,"tools/list")).status()).toBe(401);
    await revoke(page,"只读 e2e");
    expect((await send(request,read.value,"tools/list")).status()).toBe(401);
    await revoke(page,"公开编辑 e2e");
    await revoke(page,"私有编辑 e2e");
  } finally {
    if (await disable.isVisible()) await disable.click();
    await expect(enable).toBeVisible();
  }
  expect((await send(request,undefined,"tools/list")).status()).toBe(404);
  expect(jsErrors).toEqual([]);
});
