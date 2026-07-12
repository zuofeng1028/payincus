import { PayIncusPublicApiClient, PayIncusPublicApiError } from '../payincus-public-api'

const client = new PayIncusPublicApiClient({
  baseUrl: process.env.PAYINCUS_BASE_URL || 'https://payincus.com',
  token: process.env.PAYINCUS_API_TOKEN || ''
})

async function main() {
  const campaignId = process.env.PAYINCUS_FLASH_SALE_CAMPAIGN_ID || 'summer-2026'
  const sku = process.env.PAYINCUS_FLASH_SALE_SKU || 'starter-monthly'
  const profile = await client.getProfile()

  await client.sendNotification({
    template: 'flash_sale_reminder',
    variables: { campaignId, sku },
    message: `Flash sale reminder for ${sku}`
  })

  await client.createTicket({
    subject: `Flash sale reservation ${campaignId}`,
    category: 'billing',
    priority: 'normal',
    content: `User #${profile.data.id} requested help with SKU ${sku}.`
  })
}

main().catch(error => {
  if (error instanceof PayIncusPublicApiError) {
    console.error(`PayIncus API error ${error.status}: ${error.message}`, error.details)
    process.exit(1)
  }
  throw error
})
