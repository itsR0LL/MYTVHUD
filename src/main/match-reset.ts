import type { IpcMain } from 'electron'
import { resetBPBroadcastState } from './bp/bp'
import { databaseService } from './database/database'
import { resetIntermissionBroadcastState } from './intermission/intermission'

export function registerMatchResetIPC(ipc: IpcMain): void {
  ipc.handle('match:reset-broadcast-state', async () => {
    await databaseService.settings.set('currentMatchId', null)
    await Promise.all([resetBPBroadcastState(), resetIntermissionBroadcastState()])
  })
}
