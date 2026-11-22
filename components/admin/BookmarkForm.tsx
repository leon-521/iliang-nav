"use client";

import * as React from "react";
import { Folder, Loader2, Pencil, Plus, Sparkles, Tags } from "lucide-react";
import {
  createBookmark,
  previewMetadata,
  updateBookmark,
  type ActionResult,
} from "@/lib/bookmarks/actions";
import { previewAiQuickAdd, type AiQuickAddMode } from "@/lib/ai/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_BOOKMARK_TAGS, MAX_TAG_LENGTH, MAX_TAG_INPUT_LENGTH, parseBookmarkTags, tagKey } from "@/lib/bookmarks/tags";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * 下拉框只需要「id + 名称 + 缩进层级」。
 * 不直接吃 Category 全表：前台公开页拿不到 visibility/sortOrder 这些字段，
 * 为了复用同一个表单去查全表既浪费也越权。
 */
export type CategoryOption = { id: string; name: string; depth: number };

/** 编辑时要回填的字段；新增时传 undefined */
export type EditableBookmark = {
  id: string;
  url: string;
  /** 备用链接，主站打不开时用 */
  altUrl?: string | null;
  title: string;
  description: string | null;
  iconUrl: string | null;
  categoryId: string | null;
  /** 书签自身的可见性，可能为 null（表示继承分类） */
  visibility: string | null;
  /** 首页展示顺序，数字小的排前面 */
  sortOrder: number;
  tags?: string[];
};

const VIS_ITEMS = [
  { value: "", label: "继承分类" },
  { value: "private", label: "私有" },
  { value: "unlisted", label: "链接可见" },
  { value: "public", label: "公开" },
];

const AI_DRAFT_ACTIONS = [
  { mode: "details", label: "AI 补全", icon: Sparkles },
  { mode: "category", label: "AI 智能分类", icon: Folder },
  { mode: "tags", label: "AI 标签", icon: Tags },
  { mode: "all", label: "生成 AI 草稿", icon: Sparkles },
] as const;

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * 新增 / 编辑共用一个对话框。
 *
 * 之所以不复制成两个组件：字段完全一样，只是初始值和提交目标不同。
 * 分成两套以后改一个字段要改两处，迟早会漏。
 */
export function BookmarkDialog({
  categories,
  bookmark,
  trigger,
  defaultCategoryId,
  defaultUrl,
  defaultTitle,
  defaultDescription,
  defaultSourceText,
  autoOpen = false,
  autoDetect = true,
  onSaved,
}: {
  categories: CategoryOption[];
  bookmark?: EditableBookmark;
  trigger: React.ReactNode;
  /** 前台从分类页打开时，默认选中当前分类 */
  defaultCategoryId?: string | null;
  /** 书签脚本带过来的地址，打开就填好 */
  defaultUrl?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultSourceText?: string;
  /** 书签脚本落地页用：进页面直接弹窗 */
  autoOpen?: boolean;
  autoDetect?: boolean;
  /** 保存成功后回调（落地页拿它显示「已保存」） */
  onSaved?: (id?: string) => void;
}) {
  const isEdit = Boolean(bookmark);
  const aiConsentId = React.useId();
  const sourceId = React.useId();
  const hasBrowserEvidence = Boolean(defaultDescription || defaultSourceText || (!autoDetect && defaultTitle));
  const [useProvided, setUseProvided] = React.useState(hasBrowserEvidence);
  const [sourceText, setSourceText] = React.useState(defaultSourceText ?? "");
  const [open, setOpen] = React.useState(autoOpen);
  const [state, setState] = React.useState<ActionResult | null>(null);
  /**
   * 提交失败是因为「页面版本过期」时置 true。
   * 这种错误重试多少次都没用，得刷新页面，所以要单独提示。
   */
  const [stale, setStale] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  const urlRef = React.useRef<HTMLInputElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const descRef = React.useRef<HTMLInputElement>(null);

  const [iconUrl, setIconUrl] = React.useState(bookmark?.iconUrl ?? "");
  const [aiPending, setAiPending] = React.useState<AiQuickAddMode | null>(null);
  const [aiConsent, setAiConsent] = React.useState(false);
  const [aiMessage, setAiMessage] = React.useState<{ text: string; error?: boolean }>();
  const aiRun = React.useRef(false);
  const detectingRef = React.useRef(false);
  const [detecting, setDetecting] = React.useState(false);
  const [detectMsg, setDetectMsg] = React.useState<string | null>(null);
  /** 已经识别过的地址，避免 blur 反复打网络 */
  const detectedRef = React.useRef<string>("");

  const reset = () => {
    setIconUrl(bookmark?.iconUrl ?? "");
    setDetectMsg(null);
    setAiConsent(false);
    setAiMessage(undefined);
    setUseProvided(hasBrowserEvidence);
    setSourceText(defaultSourceText ?? "");
    detectedRef.current = "";
    formRef.current?.reset();
  };

  /**
   * 识别链接信息。
   * force=false 时只在标题为空时填充，不覆盖用户已经手打的内容。
   */
  const detect = React.useCallback(async (force: boolean) => {
    const raw = urlRef.current?.value?.trim() ?? "";
    if (!raw || aiRun.current || detectingRef.current) return;
    if (!force && (!autoDetect || hasBrowserEvidence || detectedRef.current === raw)) return;

    detectingRef.current = true;
    setDetecting(true);
    setAiConsent(false);
    setDetectMsg(null);
    try {
      const m = await previewMetadata(raw);
      if (urlRef.current?.value.trim() !== raw) return;
      if (!m.ok) {
        setDetectMsg(m.error ?? "识别失败");
        return;
      }

      detectedRef.current = raw;

      const titleEl = titleRef.current;
      const descEl = descRef.current;
      if (titleEl && m.title && (force || !titleEl.value.trim())) {
        titleEl.value = m.title;
      }
      if (descEl && m.description && (force || !descEl.value.trim())) {
        descEl.value = m.description;
      }
      if (m.iconUrl) setIconUrl(m.iconUrl);

      /*
       * 抓页面失败但补到了图标时，后端会带一句 error 说明原因。
       * 这时标题是空的，不能简单说「站点没有提供标题」—— 那是另一回事。
       */
      setDetectMsg(
        m.error ?? (m.title ? "已自动填充" : "站点没有提供标题"),
      );
    } catch {
      setDetectMsg("识别失败");
    } finally {
      detectingRef.current = false;
      setDetecting(false);
    }
  }, [autoDetect, hasBrowserEvidence, setAiConsent]);

  /*
   * 书签脚本落地页：地址是 URL 带过来的，进页面就该把简介和图标补上，
   * 不然用户得手动点一次「识别」。
   * 标题通常已经由脚本带过来，detect 只在为空时填，不会覆盖。
   */
  React.useEffect(() => {
    if (!autoOpen || isEdit || !defaultUrl) return;
    const timer = window.setTimeout(() => void detect(false), 150);
    return () => window.clearTimeout(timer);
  }, [autoOpen, isEdit, defaultUrl, detect]);

  async function generateAiDraft(mode: AiQuickAddMode) {
    if (aiRun.current || detectingRef.current || !aiConsent || pending) return;
    const url = urlRef.current?.value.trim() ?? "";
    if (!url) { setAiMessage({ text: "请先填写要收藏的网址。", error: true }); return; }
    const form = formRef.current;
    if (!form) return;
    const tags = form.elements.namedItem("tags") as HTMLInputElement | null;
    const category = form.elements.namedItem("categoryId") as HTMLSelectElement | null;
    const visibility = form.elements.namedItem("visibility") as HTMLSelectElement | null;
    const before = { title: titleRef.current?.value, description: descRef.current?.value, tags: tags?.value, category: category?.value, visibility: visibility?.value };
    const evidence = useProvided ? {
      title: before.title?.trim().slice(0, 300),
      description: before.description?.trim().slice(0, 500),
      text: sourceText.trim().slice(0, 8000),
    } : undefined;
    if (evidence && !evidence.title && !evidence.description && !evidence.text) {
      setAiMessage({ text: "请先填写标题、描述或粘贴正文节选。", error: true });
      return;
    }
    aiRun.current = true;
    setAiPending(mode);
    setAiConsent(false);
    setAiMessage(undefined);
    try {
      const result = await previewAiQuickAdd(url, true, mode, evidence);
      if (!result.ok) { setAiMessage({ text: result.error, error: true }); return; }
      if (urlRef.current?.value.trim() !== url || formRef.current !== form) return;
      const draft = result.draft;
      let changed = false;
      if (draft.title && titleRef.current && titleRef.current.value === before.title) {
        titleRef.current.value = draft.title; changed = true;
      }
      if (draft.description && descRef.current && descRef.current.value === before.description) {
        descRef.current.value = draft.description; changed = true;
      }
      if (draft.tags?.length && tags && tags.value === before.tags) {
        const { tags: existing } = parseBookmarkTags(tags.value);
        if (existing) {
          // Keep manually entered tags ahead of suggestions at the limit.
          const existingKeys = new Set(existing.map(tagKey));
          const additions = draft.tags.filter((tag) => !existingKeys.has(tagKey(tag))).slice(0, MAX_BOOKMARK_TAGS - existing.length);
          if (additions.length) {
            tags.value = [...existing, ...additions].join(", ");
            changed = true;
          }
        }
      }
      if (draft.categoryId && category && (mode === "category" || !before.category) && draft.categoryId !== before.category && category.value === before.category && categories.some(({ id }) => id === draft.categoryId) && visibility && visibility.value === before.visibility) {
        category.value = draft.categoryId;
        if (!visibility.value) visibility.value = "private";
        changed = true;
      }
      const success = {
        details: "已填写标题或简介，可编辑后再保存。",
        category: "已选择推荐分类，可调整后再保存。",
        tags: "已追加推荐标签，可编辑后再保存。",
        all: "AI 草稿已填入表单。可编辑标题、摘要、标签和分类，点击保存后才会生效。",
      };
      const source = result.source === "provided" ? "你提供的" : "网页";
      const evidenceLabel = result.strength === "body" ? "正文节选" : result.strength === "metadata" ? "简介" : "标题（未生成正文摘要）";
      setAiMessage({ text: `${changed ? success[mode] : "没有可填入的新建议，可继续手动填写。"} 依据：${source}${evidenceLabel}。` });
    } catch { setAiMessage({ text: "AI 预览失败，请稍后重试或手动填写。", error: true }); }
    finally { aiRun.current = false; setAiPending(null); }
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (aiRun.current) return;
    const fd = new FormData(e.currentTarget);
    setStale(false);
    startTransition(async () => {
      /*
       * 这里必须兜住异常。
       *
       * Server Action 失败时（最典型的是部署刚换完容器，浏览器里还是旧构建的 JS，
       * action id 在新服务端不存在，Next 直接回 409），调用会直接 throw。
       * 不接住的话，异常冒到路由级错误边界，整个页面变成
       * 「This page couldn't load」—— 用户以为站点坏了，其实只是该刷新一下。
       */
      try {
        const res = bookmark
          ? await updateBookmark(bookmark.id, fd)
          : await createBookmark(fd);
        setState(res);
        if (res.ok) {
          reset();
          setOpen(false);
          onSaved?.(res.id);
        }
      } catch {
        setState({
          ok: false,
          error: "保存没有发出去：页面可能还是旧版本，刷新一下再试。",
        });
        setStale(true);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (aiRun.current) return;
        setOpen(v);
        if (!v) {
          setState(null);
          reset();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/*
       * 弹窗比视口高时（手机横屏最常见），不要让整个弹窗滚 ——
       * 那样「保存」会被推到看不见的地方。改成 header 固定、
       * 中间字段区滚动、底部按钮常驻。
       */}
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑书签" : "添加书签"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "改完点保存即可生效。网址变了会重新校验是否重复。"
              : "粘贴网址后会自动识别标题、描述和图标；识别不到可以手动填。"}
          </DialogDescription>
        </DialogHeader>

        <form
          ref={formRef}
          onSubmit={onSubmit}
          className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain pr-1"
        >
          <div className="space-y-2">
            <Label htmlFor="url">
              网址 <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="url"
                name="url"
                ref={urlRef}
                readOnly={Boolean(aiPending)}
                onChange={() => { setAiConsent(false); setAiMessage(undefined); }}
                required
                autoFocus={!isEdit}
                defaultValue={bookmark?.url ?? defaultUrl ?? ""}
                placeholder="https://example.com"
                className="font-mono text-sm"
                onBlur={() => detect(false)}
                onPaste={() => {
                  // 粘贴后等一拍，让 value 落进去
                  window.setTimeout(() => detect(false), 50);
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => detect(true)}
                disabled={detecting || Boolean(aiPending)}
                className="shrink-0 gap-1.5"
                title="重新识别标题、描述和图标"
              >
                {detecting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {detecting ? "识别中" : "识别"}
              </Button>
            </div>
            {detectMsg ? (
              <p className="text-[11.5px] text-muted-foreground">{detectMsg}</p>
            ) : null}
          </div>

          <details open={hasBrowserEvidence || undefined} className="rounded-lg border bg-muted/20 px-3 py-2.5">
            <summary className="cursor-pointer text-sm font-medium text-primary">{isEdit ? "AI 辅助编辑" : "AI 智能收藏"}</summary>
            <div className="mt-3 space-y-2.5">
              <Label htmlFor={sourceId}>AI 取材方式</Label>
              <select id={sourceId} className={SELECT_CLASS} value={useProvided ? "provided" : "page"} disabled={Boolean(aiPending) || pending} onChange={(event) => { setUseProvided(event.target.value === "provided"); setAiConsent(false); setAiMessage(undefined); }}>
                <option value="page">读取公开网页（失败后可切换方式）</option>
                <option value="provided">使用本表单的标题、简介或正文节选</option>
              </select>
              {useProvided && <div className="space-y-2">
                <Label htmlFor={`${sourceId}-excerpt`}>正文节选（可选）</Label>
                <textarea id={`${sourceId}-excerpt`} value={sourceText} maxLength={8000} rows={3} className="w-full rounded-md border border-input bg-background p-2 text-sm" readOnly={Boolean(aiPending)} placeholder="粘贴一小段你有权分享的网页文字" onChange={(event) => { setSourceText(event.target.value); setAiConsent(false); }} />
                <p className="text-xs text-muted-foreground">请先核对表单中的标题、简介和节选，移除敏感信息。节选只供此次 AI 生成，不会作为书签字段保存。</p>
              </div>}
              <label htmlFor={aiConsentId} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <input id={aiConsentId} className="mt-0.5 accent-primary" type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} disabled={detecting || Boolean(aiPending) || pending} />
                <span>{useProvided ? "允许向配置的 AI 供应商发送当前标题、简介、正文节选与网址域名（不读取网页）" : "允许服务器读取当前网址，并向配置的 AI 供应商发送可读取的标题、域名、简介或正文节选"}；分类或完整草稿还会发送候选分类。AI 只更新当前表单草稿，不会自动保存。</span>
              </label>
              <div className="flex flex-wrap gap-2" aria-label="AI 草稿操作">
                {AI_DRAFT_ACTIONS.map(({ mode, label, icon: Icon }) => (
                  <Button key={mode} type="button" variant={mode === "all" ? "ghost" : "outline"} size="sm"
                    onClick={() => void generateAiDraft(mode)}
                    disabled={!aiConsent || detecting || Boolean(aiPending) || pending || (mode === "category" && !categories.length)}>
                    {aiPending === mode ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />}
                    {label}
                  </Button>
                ))}
              </div>
              {!categories.length && <p className="text-xs text-muted-foreground">创建分类后即可使用 AI 智能分类。</p>}
              {aiPending && <p role="status" className="text-xs text-muted-foreground">{useProvided ? "正在根据你提供的内容生成建议…" : "正在读取网页并生成建议…"}</p>}
              {aiMessage && <p role={aiMessage.error ? "alert" : "status"} className={`text-xs ${aiMessage.error ? "text-destructive" : "text-muted-foreground"}`}>{aiMessage.text}</p>}
            </div>
          </details>

          <input type="hidden" name="iconUrl" value={iconUrl} />

          <div className="space-y-2">
            <Label htmlFor="altUrl">备用链接</Label>
            <Input
              id="altUrl"
              name="altUrl"
              defaultValue={bookmark?.altUrl ?? ""}
              placeholder="主站打不开时用的备用地址，可选"
              className="font-mono text-sm"
            />
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              填了之后，前台卡片上会多一个入口。适合镜像站、备用域名这种。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">标题</Label>
            <div className="flex items-center gap-2">
              {iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={iconUrl}
                  alt=""
                  width={20}
                  height={20}
                  className="size-5 shrink-0 rounded object-contain"
                />
              ) : null}
              <Input
                id="title"
                name="title"
                ref={titleRef}
                onChange={() => { if (useProvided) setAiConsent(false); }}
                defaultValue={bookmark?.title ?? defaultTitle ?? ""}
                placeholder="留空则自动识别，再不行用域名"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="categoryId">分类</Label>
              <select
                id="categoryId"
                name="categoryId"
                defaultValue={bookmark?.categoryId ?? defaultCategoryId ?? ""}
                className={SELECT_CLASS}
              >
                <option value="">未分类</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"　".repeat(c.depth)}
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="visibility">可见性</Label>
              <select
                id="visibility"
                name="visibility"
                defaultValue={bookmark?.visibility ?? ""}
                className={SELECT_CLASS}
              >
                {VIS_ITEMS.map((v) => (
                  <option key={v.value || "inherit"} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Input
              id="description"
              name="description"
              ref={descRef}
              onChange={() => { if (useProvided) setAiConsent(false); }}
              defaultValue={bookmark?.description ?? defaultDescription ?? ""}
              placeholder="留空则自动识别，可选"
            />
          </div>

          {(!bookmark || bookmark.tags !== undefined) && (
            <div className="space-y-2">
              <Label htmlFor="bookmark-tags">标签</Label>
              <Input
                id="bookmark-tags"
                name="tags"
                aria-describedby="bookmark-tags-help"
                defaultValue={bookmark?.tags?.join(", ") ?? ""}
                maxLength={MAX_TAG_INPUT_LENGTH}
                placeholder="例如：设计工具，效率，参考资料"
              />
              <p id="bookmark-tags-help" className="text-xs text-muted-foreground">
                用逗号或顿号分隔；最多 {MAX_BOOKMARK_TAGS} 个，每个不超过 {MAX_TAG_LENGTH} 个字符。
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sortOrder">排序</Label>
            <Input
              id="sortOrder"
              name="sortOrder"
              type="number"
              inputMode="numeric"
              defaultValue={bookmark?.sortOrder ?? 0}
              placeholder="0"
              className="w-28 font-mono"
            />
            {/*
              这一项容易被误解成「表格里的排序」。说清楚它管的是
              首页上的先后位置，数字小的在前，同数字按添加时间。
            */}
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              数字越小越靠前，决定首页上的位置；相同则按添加时间。
            </p>
          </div>

          {state?.error ? (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <p>{state.error}</p>
              {stale ? (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-1.5 text-[12.5px] font-medium underline underline-offset-2"
                >
                  刷新页面
                </button>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="sticky bottom-0 -mx-1 border-t border-border bg-background px-1 pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setOpen(false); setState(null); reset(); }}
              disabled={pending || Boolean(aiPending)}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending || Boolean(aiPending)}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 右上角「添加书签」 */
export function BookmarkForm({ categories }: { categories: CategoryOption[] }) {
  return (
    <BookmarkDialog
      categories={categories}
      trigger={
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" />
          添加书签
        </Button>
      }
    />
  );
}

/** 表格行内的「编辑」按钮 */
export function EditBookmarkButton({
  bookmark,
  categories,
}: {
  bookmark: EditableBookmark;
  categories: CategoryOption[];
}) {
  return (
    <BookmarkDialog
      categories={categories}
      bookmark={bookmark}
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs pointer-coarse:h-9"
        >
          <Pencil className="size-3" />
          编辑
        </Button>
      }
    />
  );
}
