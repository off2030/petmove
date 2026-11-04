// Exercise the real link handlers and native helper without launching customer chats.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = fileURLToPath(new URL('../', import.meta.url))
const requirePortal = createRequire(new URL('../apps/portal/package.json', import.meta.url))
const ts = requirePortal('typescript')

function fixture({ native = true, failOpen = false, failCopy = false } = {}) {
  const calls = []
  const states = []
  let cursor = 0
  let fail = failOpen
  const cache = new Map()
  const window = {
    location: { href: 'https://app.petmove.co.kr/support' },
    Capacitor: { isNativePlatform: () => native },
    open: (...args) => { calls.push(['window.open', ...args]) },
  }
  const navigator = { clipboard: { writeText: async (text) => {
    if (failCopy) throw new Error('Clipboard unavailable')
    calls.push(['copy', text])
  } } }
  const react = {
    useRef: (initial) => {
      const index = cursor++
      return states[index] ??= { current: initial }
    },
    useState: (initial) => {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], (value) => { states[index] = value }]
    },
  }
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative)
    const module = { exports: {} }
    const source = ts.transpileModule(readFileSync(`${root}apps/portal/${relative}`, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
    function require(specifier) {
      if (specifier === 'react') return react
      if (specifier.startsWith('@/')) return load(`${specifier.slice(2)}${specifier.includes('components/') ? '.tsx' : '.ts'}`)
      if (specifier === '@capacitor/browser') return { Browser: { open: async (options) => {
        calls.push(['Browser.open', options])
        if (fail) throw new Error('Browser unavailable')
      } } }
      return requirePortal(specifier)
    }
    vm.runInNewContext(source, { module, exports: module.exports, require, window, navigator, URL }, { filename: relative })
    cache.set(relative, module.exports)
    return module.exports
  }
  const { KakaoChatLink } = load('components/kakao-chat-link.tsx')
  const props = { children: '상담', onOpen: () => calls.push(['inquiry']) }
  return {
    calls, props,
    allowOpen: () => { fail = false },
    normalize: load('lib/kakao-chat.ts').kakaoChatUrl,
    render: () => { cursor = 0; return KakaoChatLink(props) },
  }
}

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
}
function click(link, extra = {}) {
  const event = { button: 0, prevented: false, preventDefault() { this.prevented = true }, ...extra }
  link.props.onClick(event)
  return event
}
const settle = () => new Promise((resolve) => setImmediate(resolve))

for (const native of [true, false]) {
  const f = fixture({ native })
  f.props.href = 'https://pf.kakao.com/_another/'
  const link = nodes(f.render()).find((n) => n.type === 'a')
  assert.equal(link.props.href, 'https://pf.kakao.com/_another/chat')
  const event = click(link)
  await settle()
  assert.equal(event.prevented, native)
  assert.equal(f.calls.filter(([name]) => name === 'inquiry').length, 1)
  assert.equal(f.calls.some(([name]) => name === 'window.open'), false, 'Never send native chat back into the WebView')
  assert.equal(f.calls.some(([name]) => name === 'Browser.open'), native)
  if (native) assert.equal(f.calls.find(([name]) => name === 'Browser.open')[1].url, link.props.href)
  for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
    assert.equal(click(link, { [modifier]: true }).prevented, false)
  }
}

const f = fixture({ failOpen: true, failCopy: true })
const link = nodes(f.render()).find((n) => n.type === 'a')
click(link)
click(link) // ignore a second tap while the native request is still pending
await settle()
assert.equal(f.calls.filter(([name]) => name === 'Browser.open').length, 1)
let tree = nodes(f.render())
assert(tree.some((n) => n.props?.role === 'status'), 'Native rejection must be visible')
assert.equal(tree.find((n) => n.type === 'input').props.value, link.props.href)
await tree.find((n) => n.props?.children === '상담 링크 복사').props.onClick()
await settle()
assert(nodes(f.render()).some((n) => n.props?.children === '아래 주소를 길게 눌러 복사해 주세요.'))
f.allowOpen()
tree.find((n) => n.props?.children === '다시 시도').props.onClick()
await settle()
assert(!nodes(f.render()).some((n) => n.props?.role === 'status'), 'Retry clears the failure after a successful open')

assert.equal(f.normalize('pf.kakao.com/_clinic?from=portal'), 'https://pf.kakao.com/_clinic/chat?from=portal')
assert.equal(f.normalize('https://pf.kakao.com/_clinic/chat?from=portal'), 'https://pf.kakao.com/_clinic/chat?from=portal')
assert.equal(f.normalize('https://example.com/contact'), 'https://example.com/contact')
console.log('PASS: Kakao chat native/web routing, channel normalization, modifier keys, duplicate taps, failure, clipboard fallback and retry')
