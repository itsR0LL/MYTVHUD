import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import express from 'express'
import {
  createDefaultBroadcastDirectorRuntime,
  resolveBroadcastDirectorAdvance
} from '../../src/shared/broadcast-director'
import type { BackgroundVideoAsset } from '../../src/main/intermission-background-next/video-stream'
import {
  INTERMISSION_NEXT_SOCKET_EVENT,
  registerIntermissionNextRoutes,
  type IntermissionNextBackgroundFileRegistry
} from '../../src/main/intermission-next/routes'
import { createDefaultGlobalBackgroundState } from '../../src/shared/intermission-background-next/background-state'
import { createDefaultIntermissionNextLayoutState } from '../../src/shared/intermission-next'
import type { IntermissionNextOutputPayloadV1 } from '../../src/shared/intermission-output-next/output'
import { createHiddenIntermissionNextTransitionState } from '../../src/shared/intermission-transition-next/transition-state'

const outputDirectory = resolve(process.cwd(), 'src/main/intermission-next/file')
const brandDirectory = resolve(process.cwd(), 'src/main/intermission-next/assets/brand')
const mapDirectory = resolve(process.cwd(), 'src/main/intermission-next/assets/maps')

const directorRuntime = createDefaultBroadcastDirectorRuntime(1_000)
const directorContext = {
  bpReady: false,
  preparedProgramId: null,
  preparedProgramType: null
}

const state: IntermissionNextOutputPayloadV1 = {
  version: 1,
  payloadRevision: 8,
  playRevision: 3,
  serverNowMs: 1000,
  director: {
    runtime: directorRuntime,
    next: resolveBroadcastDirectorAdvance(directorRuntime, directorContext),
    ...directorContext,
    bpPlaybackStarted: false,
    jumpTargets: []
  },
  visible: false,
  pageData: null,
  layout: createDefaultIntermissionNextLayoutState(),
  background: createDefaultGlobalBackgroundState(),
  backgroundAssets: [],
  transition: createHiddenIntermissionNextTransitionState(),
  transitionTimings: {
    brandCoverMs: 0,
    backgroundRevealMs: 0,
    pageEnterMs: 0,
    pageExitMs: 0,
    brandExitMs: 0
  },
  mapMedia: [],
  activeSegment: null,
  utilityReplay: null,
  clock: {
    status: 'idle',
    totalDurationMs: 0,
    deadlineAtMs: null,
    pausedRemainingMs: null
  },
  issues: []
}

let temporaryDirectory = ''
let server: Server
let baseUrl = ''

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'mytvhud-intermission-next-routes-'))
  const registry = new Map<string, BackgroundVideoAsset>()
  for (const [assetId, content] of [
    ['background-a', '0123456789'],
    ['background-b', 'abcdefghij'],
    ['background-c', 'ABCDEFGHIJ']
  ] as const) {
    const filePath = join(temporaryDirectory, `${assetId}.bin`)
    await writeFile(filePath, Buffer.from(content))
    registry.set(assetId, { filePath, mimeType: 'application/octet-stream' })
  }

  const application = express()
  registerIntermissionNextRoutes(application, {
    outputDirectory,
    brandDirectory,
    mapDirectory,
    stateProvider: () => state,
    backgroundFileRegistry: registry as IntermissionNextBackgroundFileRegistry
  })
  server = createServer(application)
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
  await rm(temporaryDirectory, { recursive: true, force: true })
})

test('正式页面与静态 JS、CSS 返回真实文件', async () => {
  const pageResponse = await fetch(`${baseUrl}/intermission-next`)
  assert.equal(pageResponse.status, 200)
  assert.match(pageResponse.headers.get('content-type') ?? '', /^text\/html/)
  assert.match(await pageResponse.text(), /id="output-root"/)

  const scriptResponse = await fetch(`${baseUrl}/intermission-next/app.js`)
  assert.equal(scriptResponse.status, 200)
  assert.match(scriptResponse.headers.get('content-type') ?? '', /^text\/javascript/)
  assert.match(await scriptResponse.text(), /startIntermissionNextOutput/)

  const styleResponse = await fetch(`${baseUrl}/intermission-next/style.css`)
  assert.equal(styleResponse.status, 200)
  assert.match(styleResponse.headers.get('content-type') ?? '', /^text\/css/)
  assert.match(await styleResponse.text(), /prefers-reduced-motion/)
})

test('预览入口返回独立 preview.html 且不公开演示页', async () => {
  const previewResponse = await fetch(
    `${baseUrl}/intermission-next/preview?parentOrigin=http%3A%2F%2F127.0.0.1%3A5173`
  )
  assert.equal(previewResponse.status, 200)
  assert.match(previewResponse.headers.get('content-type') ?? '', /^text\/html/)
  const previewHtml = await previewResponse.text()
  assert.match(previewHtml, /data-output-mode="preview"/)
  assert.doesNotMatch(previewHtml, /socket\.io|demo-data\.js/)

  const demoPage = await fetch(`${baseUrl}/intermission-next/demo.html`)
  assert.equal(demoPage.status, 404)
})

test('品牌 SVG 与地图资源从调用方目录安全响应', async () => {
  const brandResponse = await fetch(
    `${baseUrl}/intermission-next/assets/brand/counter-strike-2-wordmark.svg`
  )
  assert.equal(brandResponse.status, 200)
  assert.match(brandResponse.headers.get('content-type') ?? '', /^image\/svg\+xml/)
  assert.match(await brandResponse.text(), /<svg/)

  const mapResponse = await fetch(
    `${baseUrl}/intermission-next/assets/maps/de_ancient/fallback.png`
  )
  assert.equal(mapResponse.status, 200)
  assert.equal(mapResponse.headers.get('content-type'), 'image/png')
  assert.ok((await mapResponse.arrayBuffer()).byteLength > 0)
})

test('状态接口返回 provider 的精确对象并禁止缓存', async () => {
  const response = await fetch(`${baseUrl}/api/intermission-next`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), state)
  assert.equal(INTERMISSION_NEXT_SOCKET_EVENT, 'intermission-next-state')
})

test('背景接口按 registry 中的 assetId 提供 Range 流', async () => {
  const response = await fetch(`${baseUrl}/intermission-next/background/background-a`, {
    headers: { Range: 'bytes=3-6' }
  })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('accept-ranges'), 'bytes')
  assert.equal(response.headers.get('content-range'), 'bytes 3-6/10')
  assert.equal(await response.text(), '3456')
})

test('未知或非法背景 assetId 返回 404', async () => {
  const missing = await fetch(`${baseUrl}/intermission-next/background/not-registered`)
  assert.equal(missing.status, 404)

  const traversal = await fetch(`${baseUrl}/intermission-next/background/%2e%2e%2fbackground-a`)
  assert.equal(traversal.status, 404)
})

test('静态资源拒绝目录穿越和未公开文件类型', async () => {
  const traversal = await fetch(
    `${baseUrl}/intermission-next/assets/maps/%2e%2e%2fbrand%2fmytvhud-chicken-mark.svg`
  )
  assert.equal(traversal.status, 404)

  const windowsTraversal = await fetch(
    `${baseUrl}/intermission-next/assets/maps/de_ancient%5c..%5cmanifest.json`
  )
  assert.equal(windowsTraversal.status, 404)

  const brandSource = await fetch(`${baseUrl}/intermission-next/assets/brand/SOURCE.md`)
  assert.equal(brandSource.status, 404)
})
