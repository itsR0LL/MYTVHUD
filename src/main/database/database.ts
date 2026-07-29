import path from 'path'
import fs from 'fs'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import type { IpcMain } from 'electron'
import { legacyUserDataDirectory, userDataDirectory } from '../app-paths'

export const dbDir = path.join(userDataDirectory, 'Database')
const legacyDbDir = path.join(legacyUserDataDirectory, 'Database')

/**
 * 数据库文件路径
 */
const matchsFile = path.join(dbDir, 'matchs.json')
const teamsFile = path.join(dbDir, 'teams.json')
const playersFile = path.join(dbDir, 'players.json')
const settingsFile = path.join(dbDir, 'settings.json')
const additionalFile = path.join(dbDir, 'additional.json')

// 确保数据库目录存在，并在首次启动时迁移旧版数据
fs.mkdirSync(dbDir, { recursive: true })
for (const fileName of [
  'matchs.json',
  'teams.json',
  'players.json',
  'settings.json',
  'additional.json'
]) {
  const targetPath = path.join(dbDir, fileName)
  const legacyPath = path.join(legacyDbDir, fileName)
  if (!fs.existsSync(targetPath) && fs.existsSync(legacyPath)) {
    try {
      fs.copyFileSync(legacyPath, targetPath)
    } catch (error) {
      console.error(`Failed to migrate ${fileName} to MYTVHUD data directory:`, error)
    }
  }
}

/**
 * 集合存储（matchs、players、teams）使用的基础实体类型
 */
export type EntityId = string | number
export interface BaseEntity {
  id: EntityId
  [key: string]: any
}

/**
 * 键值存储（settings、additional）使用的数据类型
 */
export type KeyValueData = Record<string, any>

/**
 * 集合存储的数据结构
 */
interface CollectionData<T extends BaseEntity> {
  items: T[]
}

/**
 * 键值存储的数据结构
 */
type KVData<T extends KeyValueData> = T

/**
 * 串行写入队列，保证并发操作按提交顺序执行
 */
class AsyncQueue {
  private last: Promise<void> = Promise.resolve()
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.last.then(() => fn())
    this.last = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}

/**
 * 集合存储封装，用于 matchs、players 和 teams
 */
export class CollectionStore<T extends BaseEntity> {
  private db: Low<CollectionData<T>>
  private queue = new AsyncQueue()

  constructor(filePath: string) {
    // Low v7 初始化时必须传入默认数据
    this.db = new Low<CollectionData<T>>(new JSONFile<CollectionData<T>>(filePath), { items: [] })
    // 存储文件不存在时写入默认结构
    if (!fs.existsSync(filePath)) {
      try {
        fs.writeFileSync(filePath, JSON.stringify({ items: [] }, null, 2), 'utf-8')
      } catch (e) {
        console.error('Failed to create collection store file:', filePath, e)
      }
    }
  }

  private async ensureDefaults() {
    // 读取文件；内容为空时由 Low 保留初始化时传入的默认数据
    await this.db.read()
  }

  async getAll(): Promise<T[]> {
    return this.queue.enqueue(async () => {
      await this.ensureDefaults()
      return this.db.data!.items
    })
  }

  async getById(id: EntityId): Promise<T | undefined> {
    return this.queue.enqueue(async () => {
      await this.ensureDefaults()
      // 兼容字符串和数字两种 ID 表示
      return this.db.data!.items.find((x) => x.id == id)
    })
  }

  async add(item: T): Promise<T> {
    return this.queue.enqueue(async () => {
      await this.ensureDefaults()
      const exists = this.db.data!.items.some((x) => x.id === item.id)
      if (exists) throw new Error(`Item with id ${String(item.id)} already exists`)
      this.db.data!.items.push(item)
      await this.db.write()
      return item
    })
  }

  async remove(id: EntityId): Promise<boolean> {
    return this.queue.enqueue(async () => {
      await this.ensureDefaults()
      const before = this.db.data!.items.length
      this.db.data!.items = this.db.data!.items.filter((x) => x.id !== id)
      const changed = this.db.data!.items.length !== before
      if (changed) await this.db.write()
      return changed
    })
  }

  async modify(id: EntityId, partial: Partial<T>): Promise<T | undefined> {
    return this.queue.enqueue(async () => {
      await this.ensureDefaults()
      const idx = this.db.data!.items.findIndex((x) => x.id === id)
      if (idx === -1) return undefined
      const updated = { ...this.db.data!.items[idx], ...partial, id } as T
      this.db.data!.items[idx] = updated
      await this.db.write()
      return updated
    })
  }

  /** 覆盖整个集合 */
  async set(items: T[]): Promise<T[]> {
    return this.queue.enqueue(async () => {
      await this.ensureDefaults()
      this.db.data!.items = items
      await this.db.write()
      return items
    })
  }
}

/**
 * 键值存储封装，用于 settings 和 additional
 */
export class KeyValueStore<T extends KeyValueData> {
  private db: Low<KVData<T>>
  private queue = new AsyncQueue()

  constructor(
    filePath: string,
    private defaults: T
  ) {
    // Low v7 初始化时必须传入默认数据
    this.db = new Low<KVData<T>>(new JSONFile<KVData<T>>(filePath), this.defaults)
    // 存储文件不存在时写入默认对象
    if (!fs.existsSync(filePath)) {
      try {
        const initial = this.defaults ?? ({} as T)
        fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf-8')
      } catch (e) {
        console.error('Failed to create key-value store file:', filePath, e)
      }
    }
  }

  private async ensureDefaults() {
    // 读取文件；内容为空时由 Low 保留初始化时传入的默认数据
    await this.db.read()
  }

  async getAll(): Promise<T> {
    return this.queue.enqueue(async () => {
      await this.ensureDefaults()
      return this.db.data as T
    })
  }

  async get<K extends keyof T>(key: K): Promise<T[K]> {
    return this.queue.enqueue(async () => {
      await this.ensureDefaults()
      return (this.db.data as T)[key]
    })
  }

  async add<K extends keyof T>(key: K, value: T[K]): Promise<void> {
    return this.queue.enqueue(async () => {
      await this.ensureDefaults()
      if ((this.db.data as T)[key] !== undefined) {
        throw new Error(`Key ${String(key)} already exists`)
      }
      ; (this.db.data as T)[key] = value
      await this.db.write()
    })
  }

  async set<K extends keyof T>(key: K, value: T[K]): Promise<void> {
    return this.queue.enqueue(async () => {
      await this.ensureDefaults()
        ; (this.db.data as T)[key] = value
      await this.db.write()
    })
  }

  async modify<K extends keyof T>(key: K, partial: Partial<T[K]>): Promise<T[K]> {
    return this.queue.enqueue(async () => {
      await this.ensureDefaults()
      const current = (this.db.data as T)[key]
      const updated =
        typeof current === 'object' && current !== null
          ? ({ ...current, ...partial } as T[K])
          : (partial as T[K])
        ; (this.db.data as T)[key] = updated
      await this.db.write()
      return updated
    })
  }

  async remove<K extends keyof T>(key: K): Promise<boolean> {
    return this.queue.enqueue(async () => {
      await this.ensureDefaults()
      const exists = (this.db.data as T)[key] !== undefined
      if (exists) {
        delete (this.db.data as T)[key]
        await this.db.write()
      }
      return exists
    })
  }

  /** 覆盖整个对象 */
  async setAll(next: T): Promise<T> {
    return this.queue.enqueue(async () => {
      await this.ensureDefaults()
      this.db.data = { ...next } as T
      await this.db.write()
      return this.db.data as T
    })
  }
}

/**
 * 数据库服务入口，统一管理全部存储实例
 */
export class DatabaseService {
  readonly matchs = new KeyValueStore<Record<string, BaseEntity>>(matchsFile, {})
  readonly teams = new CollectionStore<BaseEntity>(teamsFile)
  readonly players = new CollectionStore<BaseEntity>(playersFile)
  readonly settings = new KeyValueStore<KeyValueData>(settingsFile, {
    "seriesName_first": "BLAST Rival #1",
    "seriesName_second": "Grand Final",
    "seriesName_third": "MYTVHUD",
    "overlayFocusedPlayer": true,
    "overlaySidebars": "row",
    "overlayTopbar": true,
    "overlayRadar": true,
    "ctColor": "286efa",
    "tColor": "f52559",
    "borderRadius": "0px",
    "currentMatchId": "current",
    "shortcutKey": "Ctrl+Alt+I",
    "acrylicEnabled": true
  })
  readonly additional = new KeyValueStore<KeyValueData>(additionalFile, {})
}

export const databaseService = new DatabaseService()

/**
 * 删除旧版注册表单已经废弃的字段，防止历史数据继续进入 HUD 或导出包
 */
export async function removeDeprecatedRegistrationFields(): Promise<void> {
  const [players, teams, matchs] = await Promise.all([
    databaseService.players.getAll(),
    databaseService.teams.getAll(),
    databaseService.matchs.getAll()
  ])

  let playersChanged = false
  const normalizedPlayers = players.map((item) => {
    const player = { ...item }
    if (Object.prototype.hasOwnProperty.call(player, 'realname')) {
      delete player.realname
      playersChanged = true
    }
    if (Object.prototype.hasOwnProperty.call(player, 'camera')) {
      delete player.camera
      playersChanged = true
    }
    return player
  })

  let teamsChanged = false
  const normalizedTeams = teams.map((item) => {
    const team = { ...item }
    if (Object.prototype.hasOwnProperty.call(team, 'type')) {
      delete team.type
      teamsChanged = true
    }
    return team
  })

  let matchsChanged = false
  const normalizedMatchs = Object.fromEntries(
    Object.entries(matchs).map(([key, item]) => {
      const match = { ...item }
      for (const teamKey of ['team_a', 'team_b'] as const) {
        const team = match[teamKey]
        if (
          typeof team === 'object' &&
          team !== null &&
          Object.prototype.hasOwnProperty.call(team, 'type')
        ) {
          const normalizedTeam = { ...team }
          delete normalizedTeam.type
          match[teamKey] = normalizedTeam
          matchsChanged = true
        }
      }
      return [key, match]
    })
  )

  const writes: Promise<unknown>[] = []
  if (playersChanged) writes.push(databaseService.players.set(normalizedPlayers))
  if (teamsChanged) writes.push(databaseService.teams.set(normalizedTeams))
  if (matchsChanged) writes.push(databaseService.matchs.setAll(normalizedMatchs))
  await Promise.all(writes)
}

/**
 * 注册供渲染进程调用的数据库 IPC 接口
 *
 * 统一通道：'db:invoke'
 * 参数约定：
 * - target: 'matchs' | 'players' | 'teams' | 'settings' | 'additional'
 * - action: 集合存储使用 'add' | 'remove' | 'modify' | 'set' | 'getAll' | 'getById'
 *           键值存储使用 'add' | 'remove' | 'modify' | 'set' | 'setAll' | 'get' | 'getAll'
 * - payload: 对应方法所需的参数
 */
export function registerDatabaseIPC(ipc: IpcMain) {
  ipc.handle('db:invoke', async (_event, args) => {
    const { target, action, payload } = args as {
      target: keyof DatabaseService
      action: string
      payload: any
    }

    const svc = databaseService[target]
    if (!svc || typeof svc !== 'object') throw new Error(`Unknown target: ${String(target)}`)

    // 集合存储
    if (svc instanceof CollectionStore) {
      switch (action) {
        case 'getAll':
          return svc.getAll()
        case 'getById':
          return svc.getById(payload.id)
        case 'add':
          return svc.add(payload.item)
        case 'remove':
          return svc.remove(payload.id)
        case 'modify':
          return svc.modify(payload.id, payload.partial)
        case 'set':
          return svc.set(payload.items)
        default:
          throw new Error(`Unknown action for collection: ${action}`)
      }
    }

    // 键值存储
    if (svc instanceof KeyValueStore) {
      switch (action) {
        case 'getAll':
          return svc.getAll()
        case 'get':
          return svc.get(payload.key)
        case 'add':
          return svc.add(payload.key, payload.value)
        case 'set':
          return svc.set(payload.key, payload.value)
        case 'modify':
          return svc.modify(payload.key, payload.partial)
        case 'remove':
          return svc.remove(payload.key)
        case 'setAll':
          return svc.setAll(payload.data)
        default:
          throw new Error(`Unknown action for keyvalue: ${action}`)
      }
    }

    throw new Error('Invalid database service instance')
  })
}

/**
 * 也可以直接导入数据库服务：
 * import { databaseService } from './database'
 * await databaseService.matchs.add({...})
 */
