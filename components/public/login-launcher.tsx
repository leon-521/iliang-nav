"use client";

import * as React from "react";
import { LoginDialog } from "./login-dialog";
import { LOGIN_EVENT } from "@/lib/public/login-bus";

/**
 * 登录弹窗的唯一宿主，挂在 PublicShell 里。
 *
 * 全站只渲染一个弹窗实例，任何地方 dispatch LOGIN_EVENT 都能把它叫起来。
 * 这样侧栏、顶栏、移动端 Tab 栏三处入口共享同一个状态，
 * 不会出现「点了登录弹出两个框」这种事。
 */
export function LoginLauncher() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(LOGIN_EVENT, onOpen);
    return () => window.removeEventListener(LOGIN_EVENT, onOpen);
  }, []);

  return <LoginDialog open={open} onOpenChange={setOpen} />;
}
