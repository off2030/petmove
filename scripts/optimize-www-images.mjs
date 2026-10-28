// Lossless PNG → WebP. Pixels/dimensions stay identical; legacy URLs get redirects.
// Uses the Sharp version bundled with the website's Next.js installation.
// Preview: node scripts/optimize-www-images.mjs
// Apply:   node scripts/optimize-www-images.mjs --apply
import { createRequire } from 'node:module'
import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const requireWww = createRequire(path.join(root, 'apps/www/package.json'))
const sharp = createRequire(requireWww.resolve('next/package.json'))('sharp')
const apply = process.argv.includes('--apply')
const publicDir = path.join(root, 'apps/www/public')
const report = []
const manifestFile = path.join(root, 'apps/www/data/optimized-image-redirects.json')
let redirects = {}
try { redirects = JSON.parse(await readFile(manifestFile, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
let totalBefore = 0
let totalAfter = 0

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) { await walk(file); continue }
    const original = await readFile(file)
    totalBefore += original.length
    let result = original
    if (/\.png$/i.test(file) && file.includes(`${path.sep}content${path.sep}images${path.sep}`) && original.length > 150_000) {
      const metadata = await sharp(original).metadata()
      // Do not flatten animations, strip colour profiles, or change orientation/dimensions.
      if (!(metadata.pages > 1)) {
        const pipeline = sharp(original).keepMetadata()
        const optimized = await pipeline.webp({ lossless: true, effort: 6 }).toBuffer()
        if (optimized.length < original.length * 0.9) {
          const check = await sharp(optimized).metadata()
          const beforePixels = await sharp(original).ensureAlpha().raw().toBuffer()
          const afterPixels = await sharp(optimized).ensureAlpha().raw().toBuffer()
          if (check.width !== metadata.width || check.height !== metadata.height || !beforePixels.equals(afterPixels)) {
            throw new Error(`Unexpected image shape: ${file}`)
          }
          result = optimized
          const target = file.replace(/\.png$/i, '.webp')
          const sourceUrl = '/' + path.relative(publicDir, file).replaceAll('\\', '/')
          const targetUrl = '/' + path.relative(publicDir, target).replaceAll('\\', '/')
          try { await readFile(target); throw new Error(`Target already exists: ${target}`) } catch (error) { if (error.code !== 'ENOENT') throw error }
          if (apply) {
            await writeFile(target, result)
            redirects[sourceUrl] = targetUrl
            await mkdir(path.dirname(manifestFile), { recursive: true })
            await writeFile(manifestFile, JSON.stringify(redirects, null, 2) + '\n')
            await unlink(file)
          }
          report.push({ file: path.relative(root, file).replaceAll('\\', '/'), before: original.length, after: result.length })
        }
      }
    }
    totalAfter += result.length
  }
}
await walk(publicDir)
console.log(JSON.stringify({ mode: apply ? 'applied' : 'preview', count: report.length, totalBefore, totalAfter, savedPercent: Number(((1 - totalAfter / totalBefore) * 100).toFixed(1)), files: report }, null, 2))
