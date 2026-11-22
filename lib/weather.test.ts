import test from "node:test";
import assert from "node:assert/strict";
import { describeWeather, parseWeatherLocation } from "./weather";
import { greetingFor } from "./public/date";

test("weather configuration accepts zero and rounds coordinates", () => {
  assert.deepEqual(parseWeatherLocation("示例城市", "31.2345", "0"), { name: "示例城市", latitude: 31.23, longitude: 0 });
  for (const [lat, lon] of [["", "0"], ["91", "0"], ["1", "-181"], ["0x12", "0"]]) {
    assert.equal(parseWeatherLocation("测试地点", lat, lon), null);
  }
  assert.equal(parseWeatherLocation("", "0", "0"), null);
});

test("weather advice handles rain, heat, snow and invalid data", () => {
  assert.match(describeWeather(61, 18)!.advice, /带伞/);
  assert.match(describeWeather(0, 34)!.advice, /补水/);
  assert.match(describeWeather(75, -2)!.advice, /结冰/);
  assert.equal(describeWeather(2, NaN), null);
});

test("homepage greeting is based on Shanghai time", () => {
  assert.equal(greetingFor(new Date("2026-01-01T00:00:00Z")), "早上好");
  assert.equal(greetingFor(new Date("2026-01-01T12:00:00Z")), "晚上好");
});
