import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  parseSingleByteRange,
  streamBackgroundVideoFile
} from '../../src/main/intermission-background-next/video-stream'

test('支持完整、开放结束与后缀字节范围', () => {
  assert.deepEqual(parseSingleByteRange(undefined, 100), { status: 'none' })
  assert.deepEqual(parseSingleByteRange('bytes=10-19', 100), {
    status: 'valid',
    start: 10,
    end: 19
  })
  assert.deepEqual(parseSingleByteRange('bytes=90-', 100), {
    status: 'valid',
    start: 90,
    end: 99
  })
  assert.deepEqual(parseSingleByteRange('bytes=-8', 100), {
    status: 'valid',
    start: 92,
    end: 99
  })
})

test('拒绝越界、倒序和多段范围', () => {
  assert.deepEqual(parseSingleByteRange('bytes=100-', 100), { status: 'invalid' })
  assert.deepEqual(parseSingleByteRange('bytes=20-10', 100), { status: 'invalid' })
  assert.deepEqual(parseSingleByteRange('bytes=0-1,4-5', 100), { status: 'invalid' })
})

test('本地视频服务按范围流式返回而非整文件读入内存', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mytvhud-video-stream-'))
  const filePath = join(directory, 'background.bin')
  await writeFile(filePath, Buffer.from('0123456789'))
  const server = createServer((request, response) => {
    void streamBackgroundVideoFile(request, response, {
      filePath,
      mimeType: 'application/octet-stream'
    })
  })

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const response = await fetch(`http://127.0.0.1:${address.port}`, {
      headers: { Range: 'bytes=3-6' }
    })

    assert.equal(response.status, 206)
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.equal(response.headers.get('content-range'), 'bytes 3-6/10')
    assert.equal(await response.text(), '3456')
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})
