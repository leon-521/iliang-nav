import "server-only";
import { CloudSun } from "lucide-react";
import { describeWeather, type WeatherLocation } from "@/lib/weather";

type Weather = { temperature: number; condition: string; advice: string };
const cache = new Map<string, { expires: number; result: Promise<Weather | null> }>();

function weatherFor({ latitude, longitude }: WeatherLocation) {
  const key = `${latitude},${longitude}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  const result = (async () => {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: "temperature_2m,weather_code" }).toString();
    try {
      const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(2500) });
      if (!response.ok) return null;
      const { current } = await response.json();
      const temperature = current?.temperature_2m;
      const description = describeWeather(current?.weather_code, temperature);
      return description ? { ...description, temperature: Math.round(temperature) } : null;
    } catch { return null; }
  })();
  if (cache.size >= 16) cache.clear();
  const entry = { expires: Date.now() + 15 * 60_000, result };
  cache.set(key, entry);
  void result.then((value) => { if (!value) entry.expires = Date.now() + 60_000; });
  return result;
}

export function WeatherLoading() {
  return <div role="status" className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">正在读取天气…</div>;
}

export async function HomeWeather({ location }: { location: WeatherLocation }) {
  const weather = await weatherFor(location);
  return <section aria-label="当地天气" className="min-w-0 rounded-xl border bg-card p-4">
    <h2 className="flex items-center gap-2 text-sm font-semibold"><CloudSun className="size-5 shrink-0 text-primary" aria-hidden /><span className="break-words">{location.name} · 当前天气</span></h2>
    {weather ? <><p className="mt-2 flex flex-wrap items-baseline gap-2"><strong className="text-2xl tabular-nums">{weather.temperature} °C</strong><span className="text-sm text-muted-foreground">{weather.condition}</span></p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{weather.advice}</p></> : <p className="mt-2 text-xs text-muted-foreground">暂时无法获取天气，请稍后再试。</p>}
    <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[11px] text-muted-foreground hover:underline">数据：Open-Meteo</a>
  </section>;
}
