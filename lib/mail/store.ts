import { setSetting } from "@/lib/settings/service";
import { encryptSecret } from "./crypto";

/**
 * 写入 SMTP 配置。
 *
 * 密码单独走加密路径，其余字段是普通文本。
 * 密码留空表示「不改」—— 页面上永远不回显密码，用户没法把已存的值
 * 再提交一遍，所以空值必须理解成保持不变，而不是清空。
 */
export function saveMailConfig(input: {
  host: string;
  port: string;
  user: string;
  pass: string;
  from: string;
}) {
  setSetting("smtp_host", input.host);
  setSetting("smtp_port", input.port);
  setSetting("smtp_user", input.user);
  setSetting("smtp_from", input.from);

  if (input.pass) {
    setSetting("smtp_pass", encryptSecret(input.pass));
  }
}

/** 清掉后台存的密码（回到环境变量或彻底未配置） */
export function clearStoredPassword() {
  setSetting("smtp_pass", "");
}
