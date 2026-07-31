import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import {
  streamBackgroundVideoFile,
  type BackgroundVideoAsset
} from '../../intermission-background-next/video-stream'
import {
  INTERMISSION_NEXT_SOCKET_EVENT,
  type IntermissionNextOutputPayloadV1
} from '../../../shared/intermission-output-next/output'

export { INTERMISSION_NEXT_SOCKET_EVENT }

export type IntermissionNextStateProvider = () =>
  | IntermissionNextOutputPayloadV1
  | Promise<IntermissionNextOutputPayloadV1>

export type IntermissionNextBackgroundFileRegistry = ReadonlyMap<string, BackgroundVideoAsset>

interface IntermissionNextRouteRequest extends IncomingMessage {
  params?: Record<string, string | undefined>
}

type IntermissionNextRouteNext = (error?: unknown) => void

type IntermissionNextRouteHandler = (
  request: IntermissionNextRouteRequest,
  response: ServerResponse,
  next: IntermissionNextRouteNext
) => void

export interface IntermissionNextRouteApplication {
  get(path: string, ...handlers: IntermissionNextRouteHandler[]): unknown
  use(path: string, ...handlers: IntermissionNextRouteHandler[]): unknown
}

export interface RegisterIntermissionNextRoutesOptions {
  outputDirectory: string
  brandDirectory: string
  mapDirectory: string
  stateProvider: IntermissionNextStateProvider
  backgroundFileRegistry: IntermissionNextBackgroundFileRegistry
}

interface StaticFileDescriptor {
  fileName: string
  contentType: string
}

const OUTPUT_FILES: readonly StaticFileDescriptor[] = [
  { fileName: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  { fileName: 'runtime.js', contentType: 'text/javascript; charset=utf-8' },
  { fileName: 'style.css', contentType: 'text/css; charset=utf-8' }
]

const BRAND_CONTENT_TYPES = new Map<string, string>([['.svg', 'image/svg+xml; charset=utf-8']])

const MAP_CONTENT_TYPES = new Map<string, string>([
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg']
])

function sendEmpty(response: ServerResponse, statusCode: number): void {
  response.statusCode = statusCode
  response.end()
}

function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  statusCode: number,
  value: unknown
): void {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  response.statusCode = statusCode
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Length', body.length)
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(request.method === 'HEAD' ? undefined : body)
}

function pathIsInsideRoot(rootPath: string, filePath: string): boolean {
  const difference = relative(rootPath, filePath)
  return difference.length === 0 || (!difference.startsWith(`..${sep}`) && !isAbsolute(difference))
}

function requestPathname(request: IncomingMessage): string | null {
  if (typeof request.url !== 'string') return null
  try {
    return decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  } catch {
    return null
  }
}

function safePathSegments(pathname: string): string[] | null {
  if (pathname.includes('\0') || pathname.includes('\\')) return null
  const segments = pathname.split('/').filter((segment) => segment.length > 0)
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    return null
  }
  return segments
}

async function resolveStaticAsset(
  rootDirectory: string,
  request: IncomingMessage,
  contentTypes: ReadonlyMap<string, string>
): Promise<{ filePath: string; contentType: string } | null> {
  const pathname = requestPathname(request)
  const segments = pathname === null ? null : safePathSegments(pathname)
  if (segments === null) return null
  const contentType = contentTypes.get(extname(segments.at(-1) ?? '').toLowerCase())
  if (!contentType) return null

  let canonicalRoot: string
  let canonicalFile: string
  try {
    canonicalRoot = await realpath(rootDirectory)
    const unresolvedFile = resolve(canonicalRoot, ...segments)
    if (!pathIsInsideRoot(canonicalRoot, unresolvedFile)) return null
    canonicalFile = await realpath(unresolvedFile)
  } catch {
    return null
  }
  if (!pathIsInsideRoot(canonicalRoot, canonicalFile)) return null
  return { filePath: canonicalFile, contentType }
}

async function streamStaticFile(
  request: IncomingMessage,
  response: ServerResponse,
  filePath: string,
  contentType: string
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD')
    sendEmpty(response, 405)
    return
  }

  let file
  try {
    file = await stat(filePath)
  } catch {
    sendEmpty(response, 404)
    return
  }
  if (!file.isFile()) {
    sendEmpty(response, 404)
    return
  }

  response.statusCode = 200
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', contentType)
  response.setHeader('Content-Length', file.size)
  response.setHeader('X-Content-Type-Options', 'nosniff')
  if (request.method === 'HEAD') {
    response.end()
    return
  }

  await new Promise<void>((done) => {
    const stream = createReadStream(filePath)
    const finish = (): void => done()
    stream.once('error', () => {
      if (!response.headersSent) response.statusCode = 500
      response.destroy()
      done()
    })
    response.once('close', finish)
    response.once('finish', finish)
    stream.pipe(response)
  })
}

function absoluteDirectory(value: string, fieldName: string): string {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new TypeError(`${fieldName} 必须是调用方提供的绝对目录`)
  }
  return value
}

function validateOptions(options: RegisterIntermissionNextRoutesOptions): void {
  absoluteDirectory(options.outputDirectory, 'outputDirectory')
  absoluteDirectory(options.brandDirectory, 'brandDirectory')
  absoluteDirectory(options.mapDirectory, 'mapDirectory')
  if (typeof options.stateProvider !== 'function') {
    throw new TypeError('stateProvider 必须由调用方提供')
  }
  if (!options.backgroundFileRegistry || typeof options.backgroundFileRegistry.get !== 'function') {
    throw new TypeError('backgroundFileRegistry 必须由调用方提供')
  }
  for (const [assetId, asset] of options.backgroundFileRegistry) {
    if (
      typeof assetId !== 'string' ||
      assetId.length === 0 ||
      typeof asset?.filePath !== 'string' ||
      !isAbsolute(asset.filePath) ||
      typeof asset.mimeType !== 'string' ||
      asset.mimeType.length === 0
    ) {
      throw new TypeError('backgroundFileRegistry 包含无效条目')
    }
  }
}

function directStaticHandler(
  rootDirectory: string,
  descriptor: StaticFileDescriptor
): IntermissionNextRouteHandler {
  const filePath = resolve(rootDirectory, descriptor.fileName)
  return (request, response) => {
    void streamStaticFile(request, response, filePath, descriptor.contentType)
  }
}

function assetDirectoryHandler(
  rootDirectory: string,
  contentTypes: ReadonlyMap<string, string>
): IntermissionNextRouteHandler {
  return (request, response) => {
    void resolveStaticAsset(rootDirectory, request, contentTypes).then((asset) => {
      if (!asset) {
        sendEmpty(response, 404)
        return
      }
      return streamStaticFile(request, response, asset.filePath, asset.contentType)
    })
  }
}

export function registerIntermissionNextRoutes<App extends IntermissionNextRouteApplication>(
  application: App,
  options: RegisterIntermissionNextRoutesOptions
): App {
  validateOptions(options)

  application.get(
    '/intermission-next',
    directStaticHandler(options.outputDirectory, {
      fileName: 'index.html',
      contentType: 'text/html; charset=utf-8'
    })
  )
  application.get(
    '/intermission-next/preview',
    directStaticHandler(options.outputDirectory, {
      fileName: 'preview.html',
      contentType: 'text/html; charset=utf-8'
    })
  )
  for (const descriptor of OUTPUT_FILES) {
    application.get(
      `/intermission-next/${descriptor.fileName}`,
      directStaticHandler(options.outputDirectory, descriptor)
    )
  }

  application.use(
    '/intermission-next/assets/brand',
    assetDirectoryHandler(options.brandDirectory, BRAND_CONTENT_TYPES)
  )
  application.use(
    '/intermission-next/assets/maps',
    assetDirectoryHandler(options.mapDirectory, MAP_CONTENT_TYPES)
  )

  application.get('/api/intermission-next', (request, response) => {
    void Promise.resolve()
      .then(() => options.stateProvider())
      .then((state) => sendJson(request, response, 200, state))
      .catch((error: unknown) => sendJson(request, response, 500, { error: String(error) }))
  })

  application.get('/intermission-next/background/:assetId', (request, response) => {
    const assetId = request.params?.assetId
    const asset =
      typeof assetId === 'string' ? options.backgroundFileRegistry.get(assetId) : undefined
    if (!asset) {
      sendEmpty(response, 404)
      return
    }
    void streamBackgroundVideoFile(request, response, asset)
  })

  return application
}
