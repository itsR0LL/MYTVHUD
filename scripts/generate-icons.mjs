import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pngToIco from 'png-to-ico'

const [sourcePngPath, sourceSvgPath] = process.argv.slice(2)
if (!sourcePngPath || !sourceSvgPath) {
  throw new Error('用法：node scripts/generate-icons.mjs <icon.png> <icon.svg>')
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(scriptDirectory, '..')
const require = createRequire(import.meta.url)
const pngToIcoPackagePath = require.resolve('png-to-ico/package.json')
const pngToIcoRequire = createRequire(pathToFileURL(pngToIcoPackagePath))
const { PNG } = pngToIcoRequire('pngjs')
const pngModulePath = path.join(path.dirname(pngToIcoPackagePath), 'lib', 'png.js')
const { readPNG, resize } = await import(pathToFileURL(pngModulePath).href)

const sourcePng = await fs.readFile(path.resolve(sourcePngPath))
const sourceSvg = await fs.readFile(path.resolve(sourceSvgPath))
const sourceImage = await readPNG(sourcePng)
if (sourceImage.width !== sourceImage.height) {
  throw new Error('图标PNG必须是正方形')
}

const sizeBuffers = new Map()
for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
  const image = sourceImage.width === size ? sourceImage : resize(sourceImage, size, size)
  sizeBuffers.set(size, PNG.sync.write(image))
}

const buildIco = await pngToIco([16, 32, 48, 64, 128, 256].map((size) => sizeBuffers.get(size)))
const faviconIco = await pngToIco([16, 32, 48].map((size) => sizeBuffers.get(size)))

const icnsChunks = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512]
].map(([type, size]) => {
  const data = sizeBuffers.get(size)
  const header = Buffer.alloc(8)
  header.write(type, 0, 4, 'ascii')
  header.writeUInt32BE(data.length + 8, 4)
  return Buffer.concat([header, data])
})
const icnsLength = 8 + icnsChunks.reduce((total, chunk) => total + chunk.length, 0)
const icnsHeader = Buffer.alloc(8)
icnsHeader.write('icns', 0, 4, 'ascii')
icnsHeader.writeUInt32BE(icnsLength, 4)
const buildIcns = Buffer.concat([icnsHeader, ...icnsChunks], icnsLength)

const outputs = [
  ['build/icon.png', sourcePng],
  ['build/icon.svg', sourceSvg],
  ['build/icon.ico', buildIco],
  ['build/icon.icns', buildIcns],
  ['src/main/logo.png', sourcePng],
  ['src/renderer/src/components/window-controls/logo.png', sourcePng],
  ['src/main/overlay/file/favicon.ico', faviconIco]
]

await Promise.all(
  outputs.map(([relativePath, data]) =>
    fs.writeFile(path.join(projectDirectory, relativePath), data)
  )
)

for (const [relativePath] of outputs) {
  process.stdout.write(`${relativePath}\n`)
}
