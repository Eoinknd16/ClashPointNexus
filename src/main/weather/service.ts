import type { WeatherData } from '@shared/weatherTypes'

interface IpGeoResponse {
  status?: string
  lat?: number
  lon?: number
  city?: string
}

interface OpenMeteoResponse {
  current_weather?: {
    temperature: number
    weathercode: number
  }
}

/**
 * No API key, no signup, no Settings field to fill in — IP-based geolocation
 * (approximate, but zero-config) feeds coordinates into Open-Meteo's free
 * forecast API. Both fail closed (null) rather than throwing, since this is a
 * "nice to have" home-screen card, not something that should ever block on.
 */
export async function getWeather(): Promise<WeatherData | null> {
  try {
    const geoResponse = await fetch('http://ip-api.com/json/', { signal: AbortSignal.timeout(8000) })
    if (!geoResponse.ok) return null
    const geo = (await geoResponse.json()) as IpGeoResponse
    if (geo.status !== 'success' || geo.lat == null || geo.lon == null) return null

    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current_weather=true`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!weatherResponse.ok) return null
    const weather = (await weatherResponse.json()) as OpenMeteoResponse
    if (!weather.current_weather) return null

    return {
      tempCelsius: weather.current_weather.temperature,
      weatherCode: weather.current_weather.weathercode,
      city: geo.city ?? null
    }
  } catch {
    return null
  }
}
