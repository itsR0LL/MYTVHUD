import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'

export interface BackgroundVideoAsset {
  filePath: string
  mimeType: string
}

export type ByteRangeParseResult =
  | { status: 'none' }
  | { status: 'invalid' }
  | { status: 'valid'; start: number; end: number }

function nonNegativeInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : null
}

export function parseSingleByteRange(
  rangeHeader: string | undefined,
  fileSize: number
): ByteRangeParseResult {
  if (rangeHeader === undefined) return { status: 'none' }
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) return { status: 'invalid' }
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match || (match[1].length === 0 && match[2].length === 0)) {
    return { status: 'invalid' }
  }

  if (match[1].length === 0) {
    const suffixLength = nonNegativeInteger(match[2])
    if (suffixLength === null || suffixLength === 0) return { status: 'invalid' }
    const boundedLength = Math.min(suffixLength, fileSize)
    return {
      status: 'valid',
      start: fileSize - boundedLength,
      end: fileSize - 1
    }
  }

  const start = nonNegativeInteger(match[1])
  if (start === null || start >= fileSize) return { status: 'invalid' }
  if (match[2].length === 0) {
    return { status: 'valid', start, end: fileSize - 1 }
  }

  const requestedEnd = nonNegativeInteger(match[2])
  if (requestedEnd === null || requestedEnd < start) return { status: 'invalid' }
  return {
    status: 'valid',
    start,
    end: Math.min(requestedEnd, fileSize - 1)
  }
}

function sendEmpty(response: ServerResponse, statusCode: number): void {
  response.statusCode = statusCode
  response.end()
}

export async function streamBackgroundVideoFile(
  request: IncomingMessage,
  response: ServerResponse,
  asset: BackgroundVideoAsset
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD')
    sendEmpty(response, 405)
    return
  }

  let file
  try {
    file = await stat(asset.filePath)
  } catch {
    sendEmpty(response, 404)
    return
  }
  if (!file.isFile() || file.size <= 0) {
    sendEmpty(response, 404)
    return
  }

  const rangeHeader = Array.isArray(request.headers.range)
    ? request.headers.range[0]
    : request.headers.range
  const range = parseSingleByteRange(rangeHeader, file.size)
  response.setHeader('Accept-Ranges', 'bytes')
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  response.setHeader('Content-Type', asset.mimeType)
  response.setHeader('X-Content-Type-Options', 'nosniff')

  if (range.status === 'invalid') {
    response.setHeader('Content-Range', `bytes */${file.size}`)
    sendEmpty(response, 416)
    return
  }

  const start = range.status === 'valid' ? range.start : 0
  const end = range.status === 'valid' ? range.end : file.size - 1
  const contentLength = end - start + 1
  response.statusCode = range.status === 'valid' ? 206 : 200
  response.setHeader('Content-Length', contentLength)
  if (range.status === 'valid') {
    response.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`)
  }
  if (request.method === 'HEAD') {
    response.end()
    return
  }

  await new Promise<void>((resolve) => {
    const stream = createReadStream(asset.filePath, { start, end })
    const finish = (): void => resolve()
    stream.once('error', () => {
      if (!response.headersSent) response.statusCode = 500
      response.destroy()
      resolve()
    })
    response.once('close', finish)
    response.once('finish', finish)
    stream.pipe(response)
  })
}
