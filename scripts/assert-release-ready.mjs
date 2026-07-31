import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const integrationSource = readFileSync(
  resolve(root, 'src/main/intermission-next/integration.ts'),
  'utf8'
)
const editorPreviewSource = readFileSync(
  resolve(root, 'src/renderer/src/components/intermission-next/editor-preview-data.ts'),
  'utf8'
)

const blockedMarkers = [
  'DEVELOPMENT_FORMAL_OBS_SAMPLE_MUST_BE_REMOVED_BEFORE_RELEASE = true',
  'DEVELOPMENT_PREVIEW_DATA_MUST_BE_REMOVED_BEFORE_RELEASE = true'
]
const blockedFiles = [
  'src/main/intermission-next/file/demo-data.js',
  'src/main/intermission-next/file/demo.html',
  'src/main/intermission-next/file/development.html',
  'src/renderer/src/components/intermission-next/development-preview-data.ts'
]

if (
  blockedMarkers.some((marker) =>
    `${integrationSource}\n${editorPreviewSource}`.includes(marker)
  ) ||
  blockedFiles.some((filePath) => existsSync(resolve(root, filePath)))
) {
  throw new Error('正式构建已阻止：请先移除赛间播出的开发示例数据与开发期正式OBS输出')
}
