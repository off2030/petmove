import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../apps/www/next.config.mjs'

const root = fileURLToPath(new URL('../apps/www/', import.meta.url))
const mapping = JSON.parse(readFileSync(path.join(root, 'data/optimized-image-redirects.json'), 'utf8'))
const redirects = await config.redirects()
for (const [source, destination] of Object.entries(mapping)) {
  assert(source.startsWith('/content/images/') && source.endsWith('.png'), source)
  assert(destination.startsWith('/content/images/') && destination.endsWith('.webp'), destination)
  assert(existsSync(path.join(root, 'public', destination)), `Missing image ${destination}`)
  assert(!existsSync(path.join(root, 'public', source)), `Original still packaged: ${source}`)
  assert(redirects.some((r) => r.source === source && r.destination === destination && r.permanent), `Missing legacy redirect: ${source}`)
}
let bytes = 0
function walk(dir, content = false) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name)
    if (item.isDirectory()) walk(file, content)
    else if (content) {
      const text = readFileSync(file, 'utf8')
      for (const source of Object.keys(mapping)) assert(!text.includes(source), `Old image URL in ${file}`)
    } else bytes += statSync(file).size
  }
}
walk(path.join(root, 'public'))
walk(path.join(root, 'content'), true)
assert(bytes <= 70_000_000, `WWW public assets exceed 70 MB: ${(bytes / 1e6).toFixed(1)} MB. Optimize new images before deploying.`)
console.log(`WWW public assets: ${(bytes / 1e6).toFixed(1)} MB; ${Object.keys(mapping).length} legacy image redirects passed`)
