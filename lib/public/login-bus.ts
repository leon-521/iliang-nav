/**
 * 打开登录弹窗的全局事件。
 *
 * 触发点分散在顶栏、侧栏、移动端 Tab 栏，它们是三个互不相邻的客户端组件。
 * 套一层 Context 要改整条渲染链，只为传一个「打开」的回调不划算；
 * 自定义事件足够：谁都能 dispatch，唯一的监听者把弹窗打开。
 */
export const LOGIN_EVENT = "nav:open-login";

export function openLogin() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LOGIN_EVENT));
}
