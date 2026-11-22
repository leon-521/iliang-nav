export type WeatherLocation = { name: string; latitude: number; longitude: number };

export function parseWeatherLocation(name: string, latitude: string, longitude: string): WeatherLocation | null {
  const decimal = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
  const lat = Number(latitude), lon = Number(longitude);
  if (!name || name.length > 40 || !decimal.test(latitude) || !decimal.test(longitude) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { name, latitude: Math.round(lat * 100) / 100, longitude: Math.round(lon * 100) / 100 };
}

export function describeWeather(code: number, temperature: number) {
  if (!Number.isInteger(code) || !Number.isFinite(temperature) || temperature < -100 || temperature > 80) return null;
  const cold = temperature <= 5;
  const hot = temperature >= 32;
  if (code >= 95 && code <= 99) return { condition: "雷阵雨", advice: "注意雷电，尽量减少户外活动。" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { condition: "降雪", advice: "注意保暖，出门留心路面结冰。" };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { condition: "有雨", advice: "出门带伞，留意湿滑路面。" };
  if (code === 45 || code === 48) return { condition: "有雾", advice: "能见度较低，出行注意安全。" };
  const condition = ["晴", "大致晴朗", "多云", "阴"][code] ?? "天气未识别";
  return { condition, advice: hot ? "天气较热，注意补水和防晒。" : cold ? "气温较低，出门记得添衣。" : "出门前可再确认当地预报。" };
}
