import { ipcMain } from 'electron'
import { getWeather } from './service'

export function registerWeatherIpc(): void {
  ipcMain.handle('weather:get', () => getWeather())
}
