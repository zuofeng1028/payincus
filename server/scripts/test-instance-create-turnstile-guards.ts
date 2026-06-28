import { readFileSync } from 'node:fs'

const instanceRoutesSource = readFileSync(new URL('../src/routes/instances.ts', import.meta.url), 'utf8')
const instanceCreateViewSource = readFileSync(new URL('../../client/src/views/InstanceCreateView.vue', import.meta.url), 'utf8')
const zhLocaleSource = readFileSync(new URL('../../client/src/locales/zh-CN.ts', import.meta.url), 'utf8')
const enLocaleSource = readFileSync(new URL('../../client/src/locales/en.ts', import.meta.url), 'utf8')
const twLocaleSource = readFileSync(new URL('../../client/src/locales/zh-TW.ts', import.meta.url), 'utf8')

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(message)
    process.exit(1)
  }
}

assert(
  instanceRoutesSource.includes("import { turnstileVerifier } from '../lib/turnstile.js'"),
  'instances route must import the shared Turnstile verifier'
)

assert(
  instanceRoutesSource.includes('if (flashSaleItemId === undefined)') &&
    instanceRoutesSource.includes('await turnstileVerifier(request, reply)') &&
    instanceRoutesSource.includes('if (reply.sent) return'),
  'normal instance creation must run global Turnstile verification before order/resource work'
)

assert(
  instanceRoutesSource.includes('assertFlashSaleCheckoutEligibility({') &&
    instanceRoutesSource.includes('turnstileToken,') &&
    instanceRoutesSource.includes('remoteIp: request.ip'),
  'flash sale creation must keep its business-level Turnstile validation'
)

assert(
  instanceCreateViewSource.includes("await getTurnstileToken(flashSaleId ? 'flash_sale_create_instance' : 'create_instance')"),
  'instance create page must request Turnstile token for both normal and flash-sale orders'
)

assert(
  instanceCreateViewSource.includes('configStore.turnstileEnabled && configStore.turnstileSiteKey') &&
    instanceCreateViewSource.includes("instance.createPage.turnstileRequiredTitle") &&
    instanceCreateViewSource.includes("instance.createPage.turnstileRequiredDesc"),
  'instance create page must show a visible Turnstile requirement hint when enabled'
)

for (const [name, source] of [
  ['zh-CN', zhLocaleSource],
  ['zh-TW', twLocaleSource],
  ['en', enLocaleSource]
] as const) {
  assert(source.includes('turnstileRequiredTitle'), `${name} locale must include turnstileRequiredTitle`)
  assert(source.includes('turnstileRequiredDesc'), `${name} locale must include turnstileRequiredDesc`)
}

console.log('instance create Turnstile guards passed')
