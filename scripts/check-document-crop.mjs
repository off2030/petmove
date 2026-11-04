// Regression: initial/mobile crop must use source pixels once, independent of display size.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const requireAdmin = createRequire(new URL('../apps/admin/package.json', import.meta.url))
const ts = requireAdmin('typescript')
const source = readFileSync(new URL('../apps/admin/lib/scanner/crop-image.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const module = { exports: {} }
const draws = []
const canvases = []
const output = new Blob(['test jpeg'], { type: 'image/jpeg' })
const document = { createElement: (tag) => {
  assert.equal(tag, 'canvas')
  const canvas = {
    getContext: () => ({ drawImage: (...args) => draws.push(args) }),
    toBlob: (done, type, quality) => {
      assert.equal(type, 'image/jpeg')
      assert.equal(quality, 0.92)
      done(output)
    },
  }
  canvases.push(canvas)
  return canvas
} }
vm.runInNewContext(code, { module, exports: module.exports, require: requireAdmin, document })
const { cropImageToBlob } = module.exports
const img = { naturalWidth: 4000, naturalHeight: 5000, width: 320, height: 400 }
assert.equal(await cropImageToBlob(img, { unit: '%', x: 0, y: 0, width: 100, height: 100 }), output)
assert.deepEqual(draws.at(-1).slice(1), [0, 0, 4000, 5000, 0, 0, 4000, 5000])

const selection = { unit: '%', x: 25, y: 10, width: 50, height: 30 }
await cropImageToBlob(img, selection)
assert.deepEqual(draws.at(-1).slice(1), [1000, 500, 2000, 1500, 0, 0, 2000, 1500])
assert.equal(canvases.at(-1).width, 2000)
assert.equal(canvases.at(-1).height, 1500)

// Rotating/resizing the viewport must not change the selected source region.
img.width = 640
img.height = 800
await cropImageToBlob(img, selection)
assert.deepEqual(draws.at(-1).slice(1), [1000, 500, 2000, 1500, 0, 0, 2000, 1500])
await assert.rejects(cropImageToBlob(img, { ...selection, width: 0 }), /자를 영역/)
console.log('PASS: full document, mobile selection, viewport resize and empty crop protection')
