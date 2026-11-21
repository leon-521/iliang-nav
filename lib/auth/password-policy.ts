// Apply only to new passwords. Existing passwords still verify against their hashes.
export const NEW_PASSWORD_HINT = "密码须为 6–12 个字符";

// HTML pattern matches the entire value in Unicode mode. Keep the server check
// equivalent and avoid maxLength silently truncating a pasted password.
export const NEW_PASSWORD_PATTERN = "[\\s\\S]{6,12}";
const newPasswordRegex = new RegExp(`^(?:${NEW_PASSWORD_PATTERN})(?![\\s\\S])`, "u");

export function isValidNewPassword(password: string): boolean {
  return newPasswordRegex.test(password);
}
