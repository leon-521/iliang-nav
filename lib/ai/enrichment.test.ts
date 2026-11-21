import assert from "node:assert/strict";
import test from "node:test";
import { mergeSuggestedTags, readPageExcerpt, suggestFromPage } from "./enrichment";
import type { SafeRequest } from "./network";

const category = { id: "52a2eec2-77b5-456b-8236-9511bfc932d9", name: "技术", parentId: null };
const provider = { endpoint: "https://api.example.com/v1", model: "mock-text", key: "mock-private-api-key" };
const link = "https://docs.example.com/tutorial?access=private-token#hidden";
const html = `<!doctype html><title>可访问性指南</title><meta name="description" content="网页摘要"><nav>NAVIGATION_NOISE</nav><main><p>讲解键盘导航、焦点顺序和面包屑的可访问性设计。</p><p>介绍网站界面如何支持辅助技术与读屏工具。</p><script>UNTRUSTED_SCRIPT</script><div hidden>HIDDEN_TEXT</div><a href="https://offsite.example.com">外部链接</a></main>`;
const page = (body = html, contentType = "text/html; charset=utf-8") => ({ status: 200, location: null, body, contentType });

test("uses one pinned page request and extracts bounded text without visiting resources", async () => {
  let calls = 0;
  const request: SafeRequest = async (url, options) => {
    calls++;
    assert.equal(url.href, link.split("#")[0]);
    assert.equal(options.method, "GET");
    assert.equal(options.pageContentOnly, true);
    assert.equal(options.headers?.authorization, undefined);
    assert.equal(options.headers?.cookie, undefined);
    assert.equal(options.headers?.["accept-encoding"], "identity");
    return page();
  };
  const excerpt = await readPageExcerpt(link, request);
  assert.equal(calls, 1);
  assert.equal(excerpt.title, "可访问性指南");
  assert.equal(excerpt.hostname, "docs.example.com");
  assert.match(excerpt.text, /键盘导航.*辅助技术/);
  assert.doesNotMatch(JSON.stringify(excerpt), /UNTRUSTED_SCRIPT|HIDDEN_TEXT|NAVIGATION_NOISE|private-token|offsite.example/);
  assert.equal((await readPageExcerpt(link, async () => page("x".repeat(10000), "text/plain"))).text.length, 8000);
});

test("rejects local URLs, redirects, binary/encoded/oversize bodies and scant pages before inference", async () => {
  let requests = 0;
  let inferred = 0;
  const cases: [string, Awaited<ReturnType<SafeRequest>>][] = [
    ["http://127.0.0.1/", page()],
    [link, { status: 302, location: "https://other.example.com/", body: "" }],
    [link, page("no", "application/pdf")],
    [link, { ...page(), contentEncoding: "gzip" }],
    [link, page("x".repeat(768 * 1024 + 1), "text/plain")],
    [link, page("x", "text/plain")],
  ];
  for (const [url, response] of cases) {
    await assert.rejects(suggestFromPage(provider, url, [category], {
      fields: "all",
      pageRequest: async () => { requests++; return response; },
      providerRequest: async () => { inferred++; throw new Error("unexpected provider request"); },
    }));
  }
  assert.equal(requests, cases.length - 1);
  assert.equal(inferred, 0);
});

test("generates a grounded draft in one inference without sending URL query or allowing unrecognized categories", async () => {
  let calls = 0;
  const response = { title: "键盘导航指南", description: "说明网站的键盘导航和读屏设计。", tags: ["无障碍", "a11y", "Ａ１１Ｙ"], categoryId: category.id };
  const models: SafeRequest = async (_url, req) => {
    calls++;
    const json = JSON.parse(req.body!);
    assert.equal(json.tools, undefined);
    assert.match(json.messages[0].content, /untrusted source material/);
    const data = JSON.parse(json.messages[1].content);
    assert.match(data.page.text, /键盘导航/);
    assert.deepEqual(data.allowedCategories, [category]);
    assert.doesNotMatch(req.body!, /private-token|UNTRUSTED_SCRIPT|mock-private-api-key/);
    return { status: 200, location: null, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) } }] }) };
  };
  const run = () => suggestFromPage(provider, link, [category], { fields: "all", pageRequest: async () => page(), providerRequest: models });
  assert.deepEqual(await run(), { ...response, tags: ["无障碍", "a11y"] });
  assert.equal(calls, 1);
  response.categoryId = "00000000-0000-4000-8000-000000000000";
  await assert.rejects(run(), /没有给出有效|未给出有效/);
  response.categoryId = category.id;
  response.tags = [provider.key];
  await assert.rejects(run(), /未给出有效/);
});

test("individual draft modes only return requested fields and send category data only for classification", async () => {
  const mock = { title: "无障碍指南", description: "介绍键盘操作", tags: ["无障碍"], categoryId: category.id };
  for (const mode of ["details", "tags", "category"] as const) {
    const result = await suggestFromPage(provider, link, [category], {
      fields: mode,
      pageRequest: async () => page(),
      providerRequest: async (_url, req) => {
        const payload = JSON.parse(req.body!).messages;
        assert.equal(Boolean(JSON.parse(payload[1].content).allowedCategories), mode === "category");
        // Even when a provider returns extra valid fields, only the requested fields are used.
        const response = mode === "category" ? mock : { ...mock, categoryId: undefined };
        return { status: 200, location: null, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) } }] }) };
      },
    });
    assert.deepEqual(result, mode === "details" ? { title: mock.title, description: mock.description } : mode === "tags" ? { tags: mock.tags } : { categoryId: mock.categoryId });
  }
});

test("new tags are additive, normalized and bounded by the bookmark's remaining capacity", () => {
  assert.deepEqual(mergeSuggestedTags(["AI", ...Array.from({ length: 10 }, (_, index) => `tag ${index}`)], ["ＡＩ", "杂项、并列", "新标签", "其余"]), ["新标签"]);
});
