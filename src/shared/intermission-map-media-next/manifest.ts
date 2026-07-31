import { BP_MAPS, type BPMapId } from '../bp'

const SOURCE_REPOSITORY = 'https://github.com/MurkyYT/cs2-map-icons'
const SOURCE_BRANCH = 'main'
const SOURCE_METADATA_PATH = 'data/available.json'
const CONTRACT_SOURCE = 'src/shared/bp.ts'
const PNG_FORMAT_GUID = 'b96b3caf-0728-11d3-9d7b-0000f81ef32e'
const JPEG_FORMAT_GUID = 'b96b3cae-0728-11d3-9d7b-0000f81ef32e'
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const COMMIT_PATTERN = /^[0-9a-f]{40}$/
const SOURCE_ICON_HASH_PATTERN = /^[0-9a-f]+$/

export interface MapMediaSourceV1 {
  repository: typeof SOURCE_REPOSITORY
  branchAtAcquisition: typeof SOURCE_BRANCH
  commit: string
  commitUrl: string
  commitAuthor: string
  commitAuthoredAtUtc: string
  commitSubject: string
  metadataRepoPath: typeof SOURCE_METADATA_PATH
  metadataSha256: string
  rightsNotice: string
}

export interface MapMediaProcessingV1 {
  display: string
  component: string
  fallback: string
}

export interface MapMediaSourceFileV1 {
  sourceRepoPath: string
  sourceUrl: string
  localPath: string
  width: number
  height: number
  bytes: number
  sha256: string
  imageFormatGuid: string
}

export interface MapMediaComponentFileV1 {
  localPath: string
  width: 640
  height: 360
  bytes: number
  sha256: string
  imageFormatGuid: typeof JPEG_FORMAT_GUID
  derivedFrom: string
  encoder: 'JPEG'
  quality: 84
}

export interface MapMediaAssetPairV1 {
  display: MapMediaSourceFileV1
  component: MapMediaComponentFileV1
}

export interface MapMediaMapV1 {
  id: BPMapId
  name: string
  displayName: string
  sourceDisplayName: string
  sourceIconHash: string
  fallback: MapMediaSourceFileV1
  displayAssets: MapMediaAssetPairV1[]
  totalBytes: number
}

export interface MapMediaManifestTotalsV1 {
  maps: number
  displayAssets: number
  componentAssets: number
  fallbackAssets: number
  bytes: number
}

export interface MapMediaManifestV1 {
  schemaVersion: 1
  generatedAtUtc: string
  contractSource: typeof CONTRACT_SOURCE
  source: MapMediaSourceV1
  processing: MapMediaProcessingV1
  totals: MapMediaManifestTotalsV1
  maps: MapMediaMapV1[]
}

export class MapMediaManifestValidationError extends Error {
  constructor(
    readonly fieldPath: string,
    message: string
  ) {
    super(`${fieldPath}: ${message}`)
    this.name = 'MapMediaManifestValidationError'
  }
}

function fail(fieldPath: string, message: string): never {
  throw new MapMediaManifestValidationError(fieldPath, message)
}

function record(value: unknown, fieldPath: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(fieldPath, '必须是对象')
  }
  return value as Record<string, unknown>
}

function array(value: unknown, fieldPath: string): unknown[] {
  if (!Array.isArray(value)) return fail(fieldPath, '必须是数组')
  return value
}

function exactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  fieldPath: string
): void {
  const actualKeys = Object.keys(value).sort()
  const sortedExpectedKeys = [...expectedKeys].sort()
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    fail(
      fieldPath,
      `字段必须精确为 ${sortedExpectedKeys.join(', ')}，实际为 ${actualKeys.join(', ')}`
    )
  }
}

function string(value: unknown, fieldPath: string): string {
  if (typeof value !== 'string' || value.length === 0) return fail(fieldPath, '必须是非空字符串')
  return value
}

function literal<T extends string | number>(value: unknown, expected: T, fieldPath: string): T {
  if (value !== expected) return fail(fieldPath, `必须等于 ${String(expected)}`)
  return expected
}

function positiveSafeInteger(value: unknown, fieldPath: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    return fail(fieldPath, '必须是正安全整数')
  }
  return Number(value)
}

function sha256(value: unknown, fieldPath: string): string {
  const hash = string(value, fieldPath)
  if (!SHA256_PATTERN.test(hash)) return fail(fieldPath, '必须是小写 SHA-256')
  return hash
}

function utcTimestamp(value: unknown, fieldPath: string): string {
  const timestamp = string(value, fieldPath)
  if (!Number.isFinite(Date.parse(timestamp))) return fail(fieldPath, '必须是有效时间')
  return timestamp
}

function repositoryPath(value: unknown, fieldPath: string): string {
  const path = string(value, fieldPath)
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    return fail(fieldPath, '必须是仓库内安全相对路径')
  }
  return path
}

function localAssetPath(value: unknown, fieldPath: string): string {
  const path = string(value, fieldPath)
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    return fail(fieldPath, '必须是素材根目录内安全相对路径')
  }
  return path
}

function validateSource(value: unknown): MapMediaSourceV1 {
  const source = record(value, 'source')
  exactKeys(
    source,
    [
      'repository',
      'branchAtAcquisition',
      'commit',
      'commitUrl',
      'commitAuthor',
      'commitAuthoredAtUtc',
      'commitSubject',
      'metadataRepoPath',
      'metadataSha256',
      'rightsNotice'
    ],
    'source'
  )

  const repository = literal(source.repository, SOURCE_REPOSITORY, 'source.repository')
  const branchAtAcquisition = literal(
    source.branchAtAcquisition,
    SOURCE_BRANCH,
    'source.branchAtAcquisition'
  )
  const commit = string(source.commit, 'source.commit')
  if (!COMMIT_PATTERN.test(commit)) fail('source.commit', '必须是小写40位提交哈希')
  const commitUrl = literal(
    source.commitUrl,
    `${SOURCE_REPOSITORY}/commit/${commit}`,
    'source.commitUrl'
  )

  return {
    repository,
    branchAtAcquisition,
    commit,
    commitUrl,
    commitAuthor: string(source.commitAuthor, 'source.commitAuthor'),
    commitAuthoredAtUtc: utcTimestamp(source.commitAuthoredAtUtc, 'source.commitAuthoredAtUtc'),
    commitSubject: string(source.commitSubject, 'source.commitSubject'),
    metadataRepoPath: literal(
      source.metadataRepoPath,
      SOURCE_METADATA_PATH,
      'source.metadataRepoPath'
    ),
    metadataSha256: sha256(source.metadataSha256, 'source.metadataSha256'),
    rightsNotice: string(source.rightsNotice, 'source.rightsNotice')
  }
}

function validateProcessing(value: unknown): MapMediaProcessingV1 {
  const processing = record(value, 'processing')
  exactKeys(processing, ['display', 'component', 'fallback'], 'processing')
  return {
    display: string(processing.display, 'processing.display'),
    component: string(processing.component, 'processing.component'),
    fallback: string(processing.fallback, 'processing.fallback')
  }
}

function validateSourceFile(
  value: unknown,
  fieldPath: string,
  source: MapMediaSourceV1,
  expectedWidth: number,
  expectedHeight: number,
  expectedFormatGuid: string
): MapMediaSourceFileV1 {
  const file = record(value, fieldPath)
  exactKeys(
    file,
    [
      'sourceRepoPath',
      'sourceUrl',
      'localPath',
      'width',
      'height',
      'bytes',
      'sha256',
      'imageFormatGuid'
    ],
    fieldPath
  )
  const sourceRepoPath = repositoryPath(file.sourceRepoPath, `${fieldPath}.sourceRepoPath`)
  const sourceUrl = literal(
    file.sourceUrl,
    `https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/${source.commit}/${sourceRepoPath}`,
    `${fieldPath}.sourceUrl`
  )

  return {
    sourceRepoPath,
    sourceUrl,
    localPath: localAssetPath(file.localPath, `${fieldPath}.localPath`),
    width: literal(file.width, expectedWidth, `${fieldPath}.width`),
    height: literal(file.height, expectedHeight, `${fieldPath}.height`),
    bytes: positiveSafeInteger(file.bytes, `${fieldPath}.bytes`),
    sha256: sha256(file.sha256, `${fieldPath}.sha256`),
    imageFormatGuid: literal(
      file.imageFormatGuid,
      expectedFormatGuid,
      `${fieldPath}.imageFormatGuid`
    )
  }
}

function validateComponentFile(value: unknown, fieldPath: string): MapMediaComponentFileV1 {
  const file = record(value, fieldPath)
  exactKeys(
    file,
    [
      'localPath',
      'width',
      'height',
      'bytes',
      'sha256',
      'imageFormatGuid',
      'derivedFrom',
      'encoder',
      'quality'
    ],
    fieldPath
  )
  return {
    localPath: localAssetPath(file.localPath, `${fieldPath}.localPath`),
    width: literal(file.width, 640, `${fieldPath}.width`),
    height: literal(file.height, 360, `${fieldPath}.height`),
    bytes: positiveSafeInteger(file.bytes, `${fieldPath}.bytes`),
    sha256: sha256(file.sha256, `${fieldPath}.sha256`),
    imageFormatGuid: literal(
      file.imageFormatGuid,
      JPEG_FORMAT_GUID,
      `${fieldPath}.imageFormatGuid`
    ),
    derivedFrom: localAssetPath(file.derivedFrom, `${fieldPath}.derivedFrom`),
    encoder: literal(file.encoder, 'JPEG', `${fieldPath}.encoder`),
    quality: literal(file.quality, 84, `${fieldPath}.quality`)
  }
}

function validateMap(value: unknown, index: number, source: MapMediaSourceV1): MapMediaMapV1 {
  const fieldPath = `maps[${index}]`
  const map = record(value, fieldPath)
  exactKeys(
    map,
    [
      'id',
      'name',
      'displayName',
      'sourceDisplayName',
      'sourceIconHash',
      'fallback',
      'displayAssets',
      'totalBytes'
    ],
    fieldPath
  )

  const contract = BP_MAPS[index]
  if (!contract) return fail(fieldPath, '地图数量超出项目合同')
  const id = literal(map.id, contract.id, `${fieldPath}.id`)
  const name = literal(map.name, contract.name, `${fieldPath}.name`)
  const displayName = literal(map.displayName, contract.displayName, `${fieldPath}.displayName`)
  const sourceIconHash = string(map.sourceIconHash, `${fieldPath}.sourceIconHash`)
  if (!SOURCE_ICON_HASH_PATTERN.test(sourceIconHash)) {
    fail(`${fieldPath}.sourceIconHash`, '必须是小写十六进制字符串')
  }

  const fallback = validateSourceFile(
    map.fallback,
    `${fieldPath}.fallback`,
    source,
    512,
    512,
    PNG_FORMAT_GUID
  )
  literal(fallback.localPath, `${id}/fallback.png`, `${fieldPath}.fallback.localPath`)
  literal(fallback.sourceRepoPath, `images/${id}.png`, `${fieldPath}.fallback.sourceRepoPath`)

  const rawDisplayAssets = array(map.displayAssets, `${fieldPath}.displayAssets`)
  if (rawDisplayAssets.length === 0) fail(`${fieldPath}.displayAssets`, '至少需要一组素材')
  const usedLocalPaths = new Set<string>([fallback.localPath])
  const usedSourcePaths = new Set<string>([fallback.sourceRepoPath])
  const displayAssets = rawDisplayAssets.map((rawPair, pairIndex) => {
    const pairPath = `${fieldPath}.displayAssets[${pairIndex}]`
    const pair = record(rawPair, pairPath)
    exactKeys(pair, ['display', 'component'], pairPath)
    const display = validateSourceFile(
      pair.display,
      `${pairPath}.display`,
      source,
      1920,
      1080,
      PNG_FORMAT_GUID
    )
    const component = validateComponentFile(pair.component, `${pairPath}.component`)

    if (!display.localPath.startsWith(`${id}/display/`)) {
      fail(`${pairPath}.display.localPath`, `必须位于 ${id}/display/`)
    }
    if (!display.sourceRepoPath.startsWith('images/thumbs/')) {
      fail(`${pairPath}.display.sourceRepoPath`, '必须位于 images/thumbs/')
    }
    if (!component.localPath.startsWith(`${id}/component/`)) {
      fail(`${pairPath}.component.localPath`, `必须位于 ${id}/component/`)
    }
    literal(component.derivedFrom, display.localPath, `${pairPath}.component.derivedFrom`)

    for (const [path, pathField] of [
      [display.localPath, `${pairPath}.display.localPath`],
      [component.localPath, `${pairPath}.component.localPath`]
    ] as const) {
      if (usedLocalPaths.has(path)) fail(pathField, '本地路径不得重复')
      usedLocalPaths.add(path)
    }
    if (usedSourcePaths.has(display.sourceRepoPath)) {
      fail(`${pairPath}.display.sourceRepoPath`, '上游路径不得重复')
    }
    usedSourcePaths.add(display.sourceRepoPath)
    return { display, component }
  })

  const calculatedBytes =
    fallback.bytes +
    displayAssets.reduce((sum, pair) => sum + pair.display.bytes + pair.component.bytes, 0)
  const totalBytes = literal(map.totalBytes, calculatedBytes, `${fieldPath}.totalBytes`)

  return {
    id,
    name,
    displayName,
    sourceDisplayName: string(map.sourceDisplayName, `${fieldPath}.sourceDisplayName`),
    sourceIconHash,
    fallback,
    displayAssets,
    totalBytes
  }
}

function validateTotals(value: unknown, maps: readonly MapMediaMapV1[]): MapMediaManifestTotalsV1 {
  const totals = record(value, 'totals')
  exactKeys(
    totals,
    ['maps', 'displayAssets', 'componentAssets', 'fallbackAssets', 'bytes'],
    'totals'
  )
  const displayAssets = maps.reduce((sum, map) => sum + map.displayAssets.length, 0)
  const bytes = maps.reduce((sum, map) => sum + map.totalBytes, 0)
  return {
    maps: literal(totals.maps, maps.length, 'totals.maps'),
    displayAssets: literal(totals.displayAssets, displayAssets, 'totals.displayAssets'),
    componentAssets: literal(totals.componentAssets, displayAssets, 'totals.componentAssets'),
    fallbackAssets: literal(totals.fallbackAssets, maps.length, 'totals.fallbackAssets'),
    bytes: literal(totals.bytes, bytes, 'totals.bytes')
  }
}

export function validateMapMediaManifest(value: unknown): MapMediaManifestV1 {
  const manifest = record(value, 'manifest')
  exactKeys(
    manifest,
    ['schemaVersion', 'generatedAtUtc', 'contractSource', 'source', 'processing', 'totals', 'maps'],
    'manifest'
  )
  literal(manifest.schemaVersion, 1, 'schemaVersion')
  const source = validateSource(manifest.source)
  const rawMaps = array(manifest.maps, 'maps')
  if (rawMaps.length !== BP_MAPS.length) {
    fail('maps', `必须精确覆盖 ${BP_MAPS.length} 张项目地图`)
  }
  const maps = rawMaps.map((map, index) => validateMap(map, index, source))

  return {
    schemaVersion: 1,
    generatedAtUtc: utcTimestamp(manifest.generatedAtUtc, 'generatedAtUtc'),
    contractSource: literal(manifest.contractSource, CONTRACT_SOURCE, 'contractSource'),
    source,
    processing: validateProcessing(manifest.processing),
    totals: validateTotals(manifest.totals, maps),
    maps
  }
}

export function mapMediaById(manifest: MapMediaManifestV1, mapId: BPMapId): MapMediaMapV1 {
  const map = manifest.maps.find((item) => item.id === mapId)
  if (!map) fail('maps', `缺少地图 ${mapId}`)
  return map
}
