import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidNewPassword, NEW_PASSWORD_PATTERN } from "./password-policy";

test("new passwords accept 6–12 Unicode code points, inclusively", () => {
  const browserPattern = new RegExp(`^(?:${NEW_PASSWORD_PATTERN})$`, "v");
  for (const [length, accepted] of [[0, false], [5, false], [6, true], [12, true], [13, false]] as const) {
    for (const character of ["a", "字", "🔔"]) {
      const password = character.repeat(length);
      assert.equal(isValidNewPassword(password), accepted, `${length} × ${character}`);
      assert.equal(browserPattern.test(password), accepted, `browser: ${length} × ${character}`);
    }
  }
});
