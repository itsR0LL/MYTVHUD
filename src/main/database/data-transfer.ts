import { app, dialog, shell } from 'electron'
import type { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'
import { databaseService, dbDir } from './database'
import type { BaseEntity } from './database'
import { emitOverlayRefresh } from '../gsi/gsi'

const PACKAGE_FORMAT = 'MYTVHUD_DATA_PACKAGE'
const PACKAGE_SCHEMA_VERSION = 1
const PACKAGE_EXTENSION = '.mytvhud'

type PlayerRecord = BaseEntity & {
  name: string
  realname: string
  steamid: string
  camera: string
  avatar: string
  type: 'player' | 'coach' | 'spectator'
}

type TeamRecord = BaseEntity & {
  name: string
  name_ingame: string
  avatar?: string
  type: 'Normal' | 'Faceit'
}

type TransferResult = {
  success: boolean
  canceled?: boolean
  filePath?: string
  backupPath?: string
  playerCount?: number
  teamCount?: number
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasValidId(value: unknown): value is string | number {
  return (
    (typeof value === 'string' && value.length > 0) ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}

function requireString(record: Record<string, unknown>, field: string, source: string): void {
  if (typeof record[field] !== 'string') {
    throw new Error(`${source} 中的 ${field} 必须是字符串`)
  }
}

function validatePlayers(items: unknown[]): PlayerRecord[] {
  const ids = new Set<string>()
  const steamIds = new Set<string>()

  return items.map((item, index) => {
    const source = `players.json 第 ${index + 1} 条记录`
    if (!isRecord(item)) throw new Error(`${source} 不是对象`)
    if (!hasValidId(item.id)) throw new Error(`${source} 的 id 无效`)

    for (const field of ['name', 'realname', 'steamid', 'camera', 'avatar']) {
      requireString(item, field, source)
    }
    if (!['player', 'coach', 'spectator'].includes(String(item.type))) {
      throw new Error(`${source} 的 type 无效`)
    }

    const idKey = String(item.id)
    if (ids.has(idKey)) throw new Error(`players.json 中存在重复 id：${idKey}`)
    ids.add(idKey)

    const steamId = item.steamid as string
    if (steamIds.has(steamId)) throw new Error(`players.json 中存在重复 steamid：${steamId}`)
    steamIds.add(steamId)

    return item as PlayerRecord
  })
}

function validateTeams(items: unknown[]): TeamRecord[] {
  const ids = new Set<string>()
  const inGameNames = new Set<string>()

  return items.map((item, index) => {
    const source = `teams.json 第 ${index + 1} 条记录`
    if (!isRecord(item)) throw new Error(`${source} 不是对象`)
    if (!hasValidId(item.id)) throw new Error(`${source} 的 id 无效`)

    for (const field of ['name', 'name_ingame']) {
      requireString(item, field, source)
    }
    if (item.avatar !== undefined && typeof item.avatar !== 'string') {
      throw new Error(`${source} 的 avatar 必须是字符串`)
    }
    if (!['Normal', 'Faceit'].includes(String(item.type))) {
      throw new Error(`${source} 的 type 无效`)
    }

    const idKey = String(item.id)
    if (ids.has(idKey)) throw new Error(`teams.json 中存在重复 id：${idKey}`)
    ids.add(idKey)

    const inGameName = item.name_ingame as string
    if (inGameNames.has(inGameName)) {
      throw new Error(`teams.json 中存在重复 name_ingame：${inGameName}`)
    }
    inGameNames.add(inGameName)

    return item as TeamRecord
  })
}

function parseCollection(text: string, fileName: string): unknown[] {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`${fileName} 不是有效的 JSON`)
  }
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error(`${fileName} 缺少 items 数组`)
  }
  return value.items
}

function fileTimestamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('')
}

function ensurePackageExtension(filePath: string): string {
  return filePath.toLowerCase().endsWith(PACKAGE_EXTENSION)
    ? filePath
    : `${filePath}${PACKAGE_EXTENSION}`
}

async function createPackage(
  players: BaseEntity[],
  teams: BaseEntity[],
  purpose: 'export' | 'automatic-backup'
): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        format: PACKAGE_FORMAT,
        schemaVersion: PACKAGE_SCHEMA_VERSION,
        appVersion: app.getVersion(),
        exportedAt: new Date().toISOString(),
        purpose,
        contents: ['players.json', 'teams.json']
      },
      null,
      2
    )
  )
  zip.file('players.json', JSON.stringify({ items: players }, null, 2))
  zip.file('teams.json', JSON.stringify({ items: teams }, null, 2))
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  })
}

async function readPackage(filePath: string): Promise<{
  players: PlayerRecord[]
  teams: TeamRecord[]
}> {
  const zip = await JSZip.loadAsync(await fs.promises.readFile(filePath))
  const expectedFiles = new Set(['manifest.json', 'players.json', 'teams.json'])
  const packageFiles = Object.values(zip.files).filter((entry) => !entry.dir)

  if (
    packageFiles.length !== expectedFiles.size ||
    packageFiles.some((entry) => !expectedFiles.has(entry.name))
  ) {
    throw new Error('数据包文件结构无效')
  }

  const manifestEntry = zip.file('manifest.json')
  const playersEntry = zip.file('players.json')
  const teamsEntry = zip.file('teams.json')
  if (!manifestEntry || !playersEntry || !teamsEntry) {
    throw new Error('数据包缺少必需文件')
  }

  let manifest: unknown
  try {
    manifest = JSON.parse(await manifestEntry.async('string'))
  } catch {
    throw new Error('manifest.json 不是有效的 JSON')
  }
  if (!isRecord(manifest) || manifest.format !== PACKAGE_FORMAT) {
    throw new Error('不是 MYTVHUD 数据包')
  }
  if (manifest.schemaVersion !== PACKAGE_SCHEMA_VERSION) {
    throw new Error(`不支持的数据包版本：${String(manifest.schemaVersion)}`)
  }

  const players = validatePlayers(
    parseCollection(await playersEntry.async('string'), 'players.json')
  )
  const teams = validateTeams(parseCollection(await teamsEntry.async('string'), 'teams.json'))
  return { players, teams }
}

async function openDataDirectory(): Promise<TransferResult> {
  fs.mkdirSync(dbDir, { recursive: true })
  const error = await shell.openPath(dbDir)
  return error ? { success: false, error } : { success: true, filePath: dbDir }
}

async function exportDataPackage(): Promise<TransferResult> {
  const result = await dialog.showSaveDialog({
    title: '导出赛事数据',
    defaultPath: path.join(app.getPath('documents'), `MYTVHUD-data-${fileTimestamp()}.mytvhud`),
    filters: [{ name: 'MYTVHUD 数据包', extensions: ['mytvhud'] }]
  })
  if (result.canceled || !result.filePath) return { success: false, canceled: true }

  try {
    const [players, teams] = await Promise.all([
      databaseService.players.getAll(),
      databaseService.teams.getAll()
    ])
    const filePath = ensurePackageExtension(result.filePath)
    await fs.promises.writeFile(filePath, await createPackage(players, teams, 'export'))
    return {
      success: true,
      filePath,
      playerCount: players.length,
      teamCount: teams.length
    }
  } catch (error) {
    return { success: false, error: String(error instanceof Error ? error.message : error) }
  }
}

async function importDataPackage(): Promise<TransferResult> {
  const selection = await dialog.showOpenDialog({
    title: '导入赛事数据',
    defaultPath: app.getPath('documents'),
    properties: ['openFile'],
    filters: [{ name: 'MYTVHUD 数据包', extensions: ['mytvhud'] }]
  })
  if (selection.canceled || selection.filePaths.length !== 1) {
    return { success: false, canceled: true }
  }

  try {
    const filePath = selection.filePaths[0]
    const imported = await readPackage(filePath)
    const confirmation = await dialog.showMessageBox({
      type: 'warning',
      title: '导入赛事数据',
      message: '导入将覆盖本机现有的战队和选手数据。',
      detail: `数据包包含 ${imported.teams.length} 支战队、${imported.players.length} 名选手。覆盖前会自动备份现有数据。`,
      buttons: ['取消', '导入并覆盖'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (confirmation.response !== 1) return { success: false, canceled: true }

    const [currentPlayers, currentTeams] = await Promise.all([
      databaseService.players.getAll(),
      databaseService.teams.getAll()
    ])
    const backupDirectory = path.join(dbDir, 'Backups')
    fs.mkdirSync(backupDirectory, { recursive: true })
    const backupPath = path.join(backupDirectory, `before-import-${fileTimestamp()}.mytvhud`)
    await fs.promises.writeFile(
      backupPath,
      await createPackage(currentPlayers, currentTeams, 'automatic-backup')
    )

    try {
      await databaseService.players.set(imported.players)
      await databaseService.teams.set(imported.teams)
    } catch (error) {
      const rollback = await Promise.allSettled([
        databaseService.players.set(currentPlayers),
        databaseService.teams.set(currentTeams)
      ])
      if (rollback.some((entry) => entry.status === 'rejected')) {
        throw new Error(`导入失败且自动恢复未完全成功，备份位于：${backupPath}`)
      }
      throw error
    }

    emitOverlayRefresh()
    return {
      success: true,
      filePath,
      backupPath,
      playerCount: imported.players.length,
      teamCount: imported.teams.length
    }
  } catch (error) {
    return { success: false, error: String(error instanceof Error ? error.message : error) }
  }
}

export function registerDataTransferIPC(ipc: IpcMain): void {
  ipc.handle('data:open-directory', openDataDirectory)
  ipc.handle('data:export', exportDataPackage)
  ipc.handle('data:import', importDataPackage)
}
