import { createHash } from 'node:crypto'
import { PayIncusPublicApiClient, PayIncusPublicApiError } from '../payincus-public-api'

const client = new PayIncusPublicApiClient({
  baseUrl: process.env.PAYINCUS_BASE_URL || 'https://payincus.com',
  token: process.env.PAYINCUS_API_TOKEN || ''
})

function stableIdempotencyKey(userId: number, campaignId: string, sku: string) {
  return createHash('sha256').update(`${userId}:${campaignId}:${sku}`).digest('hex')
}

async function main() {
  const pluginId = process.env.PAYINCUS_FLASH_SALE_PLUGIN_ID || 'com.payincus.flash-sale'
  const campaignId = process.env.PAYINCUS_FLASH_SALE_CAMPAIGN_ID || 'summer-2026'
  const sku = process.env.PAYINCUS_FLASH_SALE_SKU || 'starter-monthly'
  const profile = await client.getProfile()
  const idempotencyKey = stableIdempotencyKey(profile.data.id, campaignId, sku)

  const reserved = await client.dispatchPluginAction(pluginId, 'reserveStock', {
    idempotencyKey,
    payload: {
      campaignId,
      sku,
      quantity: 1
    }
  })

  await client.sendNotification({
    template: 'flash_sale_reminder',
    variables: { campaignId, sku },
    message: `Reserved flash sale stock for ${sku}`
  })

  await client.createTicket({
    subject: `Flash sale reservation ${campaignId}`,
    category: 'billing',
    priority: 'normal',
    content: `Reservation response: ${JSON.stringify(reserved.data)}`
  })
}

main().catch(error => {
  if (error instanceof PayIncusPublicApiError) {
    console.error(`PayIncus API error ${error.status}: ${error.message}`, error.details)
    process.exit(1)
  }
  throw error
})
