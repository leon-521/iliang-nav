"use client";

import * as React from "react";
import { Bookmark, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { BookmarkDialog } from "@/components/admin/BookmarkForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginInlineAction, type LoginInlineState } from "@/lib/auth/actions";
import type { CategoryOption } from "@/lib/categories/service";
import { isBookmarkletFragment, readBookmarkletCapture, type BookmarkletCapture } from "@/lib/public/bookmarklet";

/** A bookmarklet draft stays in this page's memory, including during inline login. */
export function QuickAddPanel({ isAdmin, categories, initialUrl, initialTitle }: {
  isAdmin: boolean;
  categories: CategoryOption[];
  initialUrl: string;
  initialTitle: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = React.useState(false);
  const [landing, setLanding] = React.useState<{ capture: BookmarkletCapture | null; invalid: boolean }>();
  const consumed = React.useRef(false);
  const [loginResult, submitLogin, loggingIn] = React.useActionState(async (_prev: LoginInlineState, form: FormData) => {
    try {
      const result = await loginInlineAction(null, form);
      if (result?.ok) router.refresh();
      return result;
    } catch { return { error: "暂时无法登录，请稍后重试。" }; }
  }, null);

  React.useEffect(() => {
    const hash = window.location.hash;
    const fragment = isBookmarkletFragment(hash);
    // Let Next synchronize its canonical URL; reusing its internal history state skips that update.
    if (fragment) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (consumed.current) return;
    consumed.current = true;
    const capture = fragment ? readBookmarkletCapture(hash) : null;
    // Keep the fragment out of storage and out of the router.refresh URL.
    queueMicrotask(() => setLanding({ capture, invalid: fragment && !capture }));
  }, [isAdmin]);

  if (!landing) return <p role="status" className="p-6 text-center text-sm text-muted-foreground">正在打开收藏页…</p>;

  const { capture, invalid } = landing;
  if (!isAdmin) return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6">
        <h1 className="text-lg font-semibold">登录后收藏</h1>
        <p className="text-sm text-muted-foreground">请在本页登录。收藏草稿只保留在当前页面，刷新或关闭会丢失。</p>
        <form action={submitLogin} className="space-y-3">
          <div className="space-y-1"><Label htmlFor="quick-login-email">邮箱</Label><Input id="quick-login-email" name="email" type="email" autoComplete="username" required /></div>
          <div className="space-y-1"><Label htmlFor="quick-login-password">密码</Label><Input id="quick-login-password" name="password" type="password" autoComplete="current-password" required /></div>
          {loginResult?.error && <p role="alert" className="text-sm text-destructive">{loginResult.error}</p>}
          <Button type="submit" disabled={loggingIn || loginResult?.ok} className="w-full">{loggingIn || loginResult?.ok ? "正在登录…" : "登录"}</Button>
        </form>
      </div>
    </main>
  );

  if (saved) return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm text-center animate-fade-up">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CheckCircle2 className="size-5" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold">已收藏</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">这个页面已经进你的书签了，窗口可以关掉。</p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button type="button" onClick={() => window.close()}>关闭窗口</Button>
          <Button asChild variant="outline"><a href="/dashboard">去后台</a></Button>
        </div>
      </div>
    </main>
  );

  const url = capture?.url ?? initialUrl;
  const title = capture?.title ?? initialTitle;
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bookmark className="size-5" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold">收藏这个页面</h1>
        <p className="mt-1.5 break-all text-[12.5px] text-muted-foreground">
          {title || url || (invalid ? "收藏内容无效或过长，可手动填写网址。" : "没有拿到地址，手动填一下")}
        </p>
        {capture && <p className="mt-2 text-xs text-muted-foreground">已带入网址、标题、网页简介和你选中的文字（如果有）。草稿仅存于当前页面，刷新会丢失。</p>}
        <div className="mt-5 flex justify-center">
          <BookmarkDialog
            categories={categories}
            defaultUrl={url}
            defaultTitle={title}
            defaultDescription={capture?.description}
            defaultSourceText={capture?.selection}
            autoDetect={!capture}
            autoOpen
            onSaved={() => { setLanding({ capture: null, invalid: false }); setSaved(true); }}
            trigger={<Button type="button"><Bookmark aria-hidden />打开收藏窗口</Button>}
          />
        </div>
      </div>
    </main>
  );
}
