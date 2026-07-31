import type { IpcMain } from 'electron'
import { resetBPBroadcastState } from './bp/bp'
import { databaseService } from './database/database'
import { resetIntermissionBroadcastState } from './intermission/intermission'
import { resetMatchRuntimeState } from './match-session/match-session'
import { resetBroadcastRuntimeState } from './intermission/broadcast-flow'
import { resetBroadcastDirectorRuntime } from './intermission/broadcast-director'
import {
  resumeGSIProcessingAfterMatchReset,
  suspendGSIProcessingForMatchReset
} from './gsi/reset-coordinator'

export function registerMatchResetIPC(ipc: IpcMain): void {
  ipc.handle('match:reset-broadcast-state', async (_event, confirmed: unknown) => {
    if (confirmed !== true) throw new Error('完全重置赛事工作区必须经过二次确认')
    await suspendGSIProcessingForMatchReset()
    try {
      await databaseService.settings.set('currentMatchId', null)
      await resetBroadcastDirectorRuntime()
      await Promise.all([
        resetBPBroadcastState(),
        resetIntermissionBroadcastState(),
        resetMatchRuntimeState(),
        resetBroadcastRuntimeState()
      ])
    } finally {
      resumeGSIProcessingAfterMatchReset()
    }
  })
}
