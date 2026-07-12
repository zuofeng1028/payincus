<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useThemeStore } from '@/stores/theme'
import api, { type VipLevelProgress, type VipProgressCondition, type VipProgressMetric } from '@/api'
import Skeleton from '@/components/Skeleton.vue'
import { formatMemory, formatDisk, getStatusInfo } from '@/utils/formatters'
import type { Instance, UserBalance, UserLifecycleOffer } from '@/types/api'
import DistroIcon from '@/components/icons/DistroIcon.vue'
import FlagIcon from '@/components/FlagIcon.vue'
import InstanceDisplayIcon from '@/components/InstanceDisplayIcon.vue'
import PluginFrameSlot from '@/components/plugins/PluginFrameSlot.vue'
import ThemeTemplateSlot from '@/components/theme/ThemeTemplateSlot.vue'
import { getRandomFunnyQuote } from '@/data/funnyQuotes'
import { freeSiteCopy } from '@/utils/freeSiteFun'
import { getVipBadgeInlineStyle, normalizeVipBadgeStyle, type VipBadgeStyle } from '@/utils/vipBadge'
import { entertainmentPath, instanceCreatePath, instanceDetailPath, instancesPath } from '@/utils/app-paths'
import { useReveal } from '@/composables/useReveal'

// 为 KeepAlive include 匹配定义组件名称（必须在所有 import 之后）
defineOptions({ name: 'DashboardView' })

const revealRoot = ref<HTMLElement | null>(null)
useReveal(revealRoot)

// 遮蔽 IPv4 地址后两位，例如：1.2.3.4 -> 1.2.*.*
function maskIpv4(ip: string | null | undefined): string | null {
  if (!ip) return null
  const parts = ip.split('.')
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`
  }
  return ip
}

function isIpv4Address(ip: string | null | undefined): boolean {
  if (!ip) return false
  return /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip)
}

// 获取显示的IP地址：有NAT的模式显示NAT公网IP，纯IPv6模式显示IPv6，其他显示内网IPv4
function getDisplayIp(instance: Instance): string | null {
  const networkMode = instance.networkMode || instance.network_mode
  // 有 NAT 端口映射的模式：显示 NAT 公网 IP
  const hasNat = networkMode === 'nat' || networkMode === 'nat_ipv6' || networkMode === 'nat_ipv6_nat'
  if (hasNat) {
    const natPublicIp = instance.natPublicIp || instance.host?.nat_public_ip
    if (isIpv4Address(natPublicIp)) {
      return maskIpv4(natPublicIp)
    }
    if (networkMode === 'nat_ipv6' && instance.ipv6) {
      return instance.ipv6
    }
    return maskIpv4(instance.ipv4)
  }
  // 纯 IPv6 模式：优先显示独立 IPv6
  if (networkMode === 'ipv6_only' && instance.ipv6) {
    return instance.ipv6
  }
  return maskIpv4(instance.ipv4)
}

// 从镜像名称提取发行版标识（用于 DistroIcon 组件）
function getDistroFromName(name: string): string {
  const lowerName = (name || '').toLowerCase()
  const distros = ['almalinux', 'alma', 'alpine', 'arch', 'centos', 'debian', 'fedora', 'gentoo', 'kali', 'mint', 'opensuse', 'suse', 'oracle', 'redhat', 'rhel', 'rockylinux', 'rocky', 'ubuntu', 'void']
  for (const distro of distros) {
    if (lowerName.includes(distro)) return distro
  }
  return 'linux'
}

// 获取付费实例的图标类型（根据节点名称判断）
// 返回 'pro' | 'prime' | 'peer' | null
function getPaidIconType(instance: Instance): 'pro' | 'prime' | 'peer' | null {
  // 只有付费实例才显示付费图标
  if (!instance.packagePlanId) return null
  
  // 如果节点名称以 PEER 开头（不区分大小写），则是托管实例，显示 peer 图标
  const hostName = instance.host?.name || ''
  if (/^PEER\d/i.test(hostName)) {
    return 'peer'
  }
  
  // 根据实例类型判断：虚拟机显示 prime，容器显示 pro
  return instance.instanceType === 'vm' ? 'prime' : 'pro'
}

// 格式化镜像名称：优先使用 imageName，否则去掉 images: 前缀
function formatImageName(image: string, imageName?: string | null): string {
  if (imageName) return imageName
  return image?.replace(/^images:/, '') || ''
}

function getInstanceTypeLabel(instance: Instance): string {
  const key = `instance.instanceType.${instance.instanceType === 'vm' ? 'vm' : 'container'}`
  const translated = t(key)
  return translated === key ? (instance.instanceType === 'vm' ? 'KVM' : 'LXC') : translated
}

function getHostName(instance: Instance): string {
  return instance.host?.name || t('dashboard.unknownHost')
}

function getStatusKey(instance: Instance): string {
  return instance.status?.toLowerCase() || 'unknown'
}

const { t, locale } = useI18n()
const authStore = useAuthStore()
const configStore = useConfigStore()
const themeStore = useThemeStore()
void configStore.loadPublicConfig()

const footerTelegramLink = computed(() => {
  const link = configStore.footerTelegramLink?.trim()
  return link || null
})

// 随机骚话（页面加载时固定，不随刷新变化）
const funnyQuote = ref('')

function getTimeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return t('dashboard.greeting.morning')
  if (hour < 18) return t('dashboard.greeting.afternoon')
  return t('dashboard.greeting.evening')
}

const instances = ref<Instance[]>([])
const balanceOverview = ref<UserBalance>({
  balance: 0,
  frozen: 0,
  totalRecharge: 0,
  totalConsume: 0
})
const userVipLevel = ref(0)
const userVipBadgeStyle = ref<VipBadgeStyle | null>(null)
const userVipProgress = ref<VipLevelProgress | null>(null)
const userPoints = ref(0)
const lifecycleOffers = ref<UserLifecycleOffer[]>([])
const loading = ref(true)

let refreshInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  // 初始化随机骚话
  funnyQuote.value = getRandomFunnyQuote(locale.value)
  await loadData()
  refreshInterval = setInterval(loadData, 15000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
})

// 当组件被 KeepAlive 停用时，暂停定时器
onDeactivated(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
})

// 当组件从 KeepAlive 缓存中激活时，恢复定时器并刷新数据
onActivated(async () => {
  // 恢复定时刷新
  if (!refreshInterval) {
    refreshInterval = setInterval(loadData, 15000)
  }
  // 立即刷新数据以确保最新
  await loadData()
})

async function loadData(): Promise<void> {
  try {
    // 如果用户未认证，停止定时刷新
    if (!authStore.isAuthenticated) {
      if (refreshInterval) {
        clearInterval(refreshInterval)
        refreshInterval = null
      }
      return
    }
    
    const [instancesRes, meRes, balanceRes, vipRes, pointsRes, offersRes] = await Promise.all([
      api.instances.list({ pageSize: 1000 }),  // 获取所有实例以确保统计准确
      api.auth.me(),
      api.billing.getUserBalance().catch(() => null),
      api.vipLevels.getMyOverview().catch(() => null),
      api.entertainment.getPoints().catch(() => null),
      api.userLifecycle.myOffers().catch(() => null)
    ])
    const res = instancesRes as { instances?: Instance[] }
    instances.value = res.instances || []
    if ((meRes as { user?: any }).user) {
      authStore.user = (meRes as { user: any }).user
    }
    if (balanceRes?.balance) {
      balanceOverview.value = balanceRes.balance
    }
    userVipLevel.value = normalizeVipLevel(vipRes?.userVipLevel)
    userVipBadgeStyle.value = userVipLevel.value > 0
      ? normalizeVipBadgeStyle(vipRes?.userVipBadgeStyle, userVipLevel.value)
      : null
    userVipProgress.value = vipRes?.userVipProgress || null
    userPoints.value = Number(pointsRes?.points || 0)
    lifecycleOffers.value = offersRes?.offers || []
  } catch (error: any) {
    console.error('Failed to load dashboard:', error)
    // 如果是认证错误（401），停止定时刷新
    if (error?.response?.status === 401 || error?.code === 'UNAUTHORIZED') {
      if (refreshInterval) {
        clearInterval(refreshInterval)
        refreshInterval = null
      }
    }
  } finally {
    loading.value = false
  }
}

const stats = computed(() => {
  const all = instances.value
  // 后端返回的状态值可能是首字母大写（Running, Stopped）或小写（running, stopped）
  // 使用 toLowerCase() 进行大小写不敏感的比较
  return {
    total: all.length,  // 已获取全部实例，直接使用数组长度
    running: all.filter(i => getStatusKey(i) === 'running').length,
    stopped: all.filter(i => getStatusKey(i) === 'stopped').length,
    creating: all.filter(i => getStatusKey(i) === 'creating').length
  }
})

const recentInstances = computed(() => instances.value.slice(0, 5))
const availableLifecycleOffers = computed(() => lifecycleOffers.value.filter(offer => !offer.used).slice(0, 3))

const statusOverviewItems = computed(() => [
  {
    key: 'running',
    label: t('dashboard.runningInstances'),
    value: stats.value.running,
    className: themeStore.isDark ? 'bg-emerald-500/12 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
  },
  {
    key: 'stopped',
    label: t('dashboard.stoppedInstances'),
    value: stats.value.stopped,
    className: themeStore.isDark ? 'bg-slate-500/12 text-slate-300' : 'bg-slate-100 text-slate-700'
  }
])

const instanceTypeStats = computed(() => {
  const vm = instances.value.filter(instance => instance.instanceType === 'vm').length
  return {
    vm,
    container: Math.max(instances.value.length - vm, 0)
  }
})

const balanceSummaryItems = computed(() => [
  {
    label: t('dashboard.totalRecharge'),
    value: formatCurrency(balanceOverview.value.totalRecharge || 0)
  },
  {
    label: t('dashboard.totalConsume'),
    value: formatCurrency(balanceOverview.value.totalConsume || 0)
  },
  {
    label: t('dashboard.userPoints'),
    value: formatPoints(userPoints.value)
  }
])

const accountPanelHint = computed(() => t('dashboard.walletHint'))

const memberBadgeStyle = computed(() => userVipLevel.value > 0 ? getVipBadgeInlineStyle(userVipBadgeStyle.value) : undefined)

const memberBadgeClass = computed(() => userVipLevel.value > 0
  ? 'border shadow-sm'
  : themeStore.isDark
    ? 'border border-gray-700 bg-gray-800 text-gray-300'
    : 'border border-gray-200 bg-gray-100 text-gray-700'
)

const overviewShellClass = computed(() => themeStore.isDark
  ? 'border-gray-800 bg-gray-950/70 shadow-black/20'
  : 'border-gray-200 bg-white shadow-gray-200/80'
)

const subtlePanelClass = computed(() => themeStore.isDark
  ? 'border-gray-800 bg-gray-900/50'
  : 'border-gray-200 bg-gray-50/70'
)

const instanceListSummary = computed(() => t('dashboard.instanceListSummary', {
  count: Math.min(recentInstances.value.length, instances.value.length),
  total: instances.value.length
}))

const vipProgressPercent = computed(() => {
  const progress = Number(userVipProgress.value?.progress || 0)
  return Math.max(0, Math.min(100, Math.round(progress)))
})

const vipProgressStyle = computed(() => ({ width: `${vipProgressPercent.value}%` }))

const vipProgressTargetText = computed(() => {
  const progress = userVipProgress.value
  if (!progress) return t('dashboard.vipProgressUnavailable')
  if (progress.nextLevel) {
    return t('dashboard.vipProgressToNext', {
      current: formatUserVipLevel(progress.currentLevel),
      next: formatUserVipLevel(progress.nextLevel)
    })
  }
  return progress.isMaxLevel ? t('dashboard.vipProgressMaxed') : t('dashboard.vipProgressNoRule')
})

const vipProgressHint = computed(() => {
  const progress = userVipProgress.value
  if (!progress?.nextLevel) return t('dashboard.vipProgressStableHint')
  if (progress.userMetric) {
    const metric = progress.conditions[0]?.metric
      ? getVipProgressMetricLabel(progress.conditions[0].metric)
      : t('dashboard.memberLevel')
    return t('dashboard.vipProgressSingleMetricHint', {
      level: formatUserVipLevel(progress.nextLevel),
      metric
    })
  }
  const key = progress.conditionMode === 'all' ? 'dashboard.vipProgressAllHint' : 'dashboard.vipProgressAnyHint'
  return t(key, { level: formatUserVipLevel(progress.nextLevel) })
})

const vipProgressConditions = computed(() => userVipProgress.value?.conditions || [])

const vipProgressConditionGridClass = computed(() => vipProgressConditions.value.length === 1
  ? 'grid-cols-1'
  : 'sm:grid-cols-2'
)

function formatCurrency(amount: number): string {
  return `¥${amount.toFixed(2)}`
}

function getLifecycleOfferUnit(type: string): string {
  return type === 'c' ? '%' : type === 'r' || type === 'd' ? 'MB' : 'GB'
}

function formatPoints(points: number): string {
  const normalized = Number.isFinite(points) ? Math.max(points, 0) : 0
  return Math.floor(normalized).toLocaleString()
}

function getVipProgressMetricLabel(metric: VipProgressMetric): string {
  const keyMap: Record<VipProgressMetric, string> = {
    totalRecharge: 'dashboard.vipMetricTotalRecharge',
    totalConsume: 'dashboard.vipMetricTotalConsume',
    totalHostingIncome: 'dashboard.vipMetricTotalHostingIncome',
    instanceCount: 'dashboard.vipMetricInstanceCount'
  }
  return t(keyMap[metric])
}

function isVipCountMetric(metric: VipProgressMetric): boolean {
  return metric === 'instanceCount'
}

function formatVipProgressValue(condition: VipProgressCondition, value: number): string {
  return isVipCountMetric(condition.metric) ? String(Math.floor(value)) : formatCurrency(value)
}

function formatVipProgressRemaining(condition: VipProgressCondition): string {
  if (condition.matched) return t('dashboard.vipProgressConditionMet')
  if (isVipCountMetric(condition.metric)) {
    return String(Math.ceil(condition.remaining))
  }
  return formatCurrency(condition.remaining)
}

function normalizeVipLevel(level: unknown): number {
  const parsed = Number(level)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

function formatUserVipLevel(level: unknown): string {
  const normalizedLevel = normalizeVipLevel(level)
  return normalizedLevel > 0 ? `VIP${normalizedLevel}` : t('dashboard.memberLevelBasic')
}

const greetingTitle = computed(() => {
  const username = authStore.user?.username || t('common.user')
  const level = normalizeVipLevel(userVipLevel.value)
  if (level <= 0) {
    return t('dashboard.greeting.basicUser', { username })
  }

  return t('dashboard.greeting.memberUser', {
    level: formatUserVipLevel(level),
    username
  })
})

const greetingText = computed(() => t('dashboard.greeting.full', {
  greeting: getTimeGreeting(),
  member: greetingTitle.value
}))

function getInstanceRowClass(): string {
  return themeStore.isDark
    ? 'border-gray-800 bg-gray-900/45 hover:border-gray-700 hover:bg-gray-900/70'
    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80'
}
</script>

<template>
  <div ref="revealRoot" class="kawaii-page kawaii-dashboard-page nimbus-dashboard space-y-6 animate-fade-in">
    <!-- 页头：问候语 + 主 CTA -->
    <header data-reveal class="nimbus-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <h1 class="truncate text-xl font-semibold tracking-tight text-themed sm:text-2xl">{{ greetingText }}</h1>
        <p class="mt-1 text-sm text-themed-muted">{{ funnyQuote }}</p>
      </div>
      <div class="flex items-center gap-2">
        <a
          v-if="footerTelegramLink"
          :href="footerTelegramLink"
          target="_blank"
          rel="noopener noreferrer"
          class="nimbus-icon-btn inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          title="Telegram"
          aria-label="Telegram"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
        </a>
        <RouterLink :to="instanceCreatePath()" class="btn-primary w-full justify-center sm:w-auto">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          {{ configStore.freeSiteMode ? freeSiteCopy.dashboardNewInstance : $t('dashboard.newInstance') }}
        </RouterLink>
      </div>
    </header>

    <ThemeTemplateSlot slot-name="user.dashboard.banner" container-class="overflow-hidden rounded-lg border border-themed bg-themed-surface" />
    <ThemeTemplateSlot slot-name="user.dashboard.cards" container-class="overflow-hidden rounded-lg border border-themed bg-themed-surface" />

    <!-- 指标卡：总实例 / 运行中 / 账户余额 / 积分 -->
    <section class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <!-- 总实例 -->
      <div class="nimbus-card nimbus-metric overflow-hidden p-4 sm:p-5" :class="overviewShellClass" style="--i: 0">
        <div class="flex items-start justify-between gap-3">
          <span class="nimbus-tile-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" />
              <path d="M7 7.5h.01M7 16.5h.01" />
            </svg>
          </span>
          <svg class="nimbus-spark" viewBox="0 0 60 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="0,17 10,15 20,16 30,10 40,12 50,6 60,8" />
          </svg>
        </div>
        <div class="mt-4 nimbus-metric-label">{{ t('dashboard.totalInstances') }}</div>
        <div class="mt-1 nimbus-metric-value font-mono tabular-nums">{{ stats.total }}</div>
        <div class="mt-1.5 nimbus-metric-delta">
          <span class="text-themed-muted">{{ t('dashboard.stoppedInstances') }}</span>
          <span class="font-mono tabular-nums text-themed">{{ stats.stopped }}</span>
        </div>
      </div>

      <!-- 运行中 -->
      <div class="nimbus-card nimbus-metric overflow-hidden p-4 sm:p-5" :class="overviewShellClass" style="--i: 1">
        <div class="flex items-start justify-between gap-3">
          <span class="nimbus-tile-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 12h4l2 6 4-13 2 8h6" />
            </svg>
          </span>
          <svg class="nimbus-spark" viewBox="0 0 60 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="0,18 10,12 20,14 30,8 40,9 50,5 60,3" />
          </svg>
        </div>
        <div class="mt-4 nimbus-metric-label">{{ t('dashboard.runningInstances') }}</div>
        <div class="mt-1 nimbus-metric-value font-mono tabular-nums">{{ stats.running }}</div>
        <div class="mt-1.5 nimbus-metric-delta" :class="stats.running > 0 ? 'nimbus-metric-delta--up' : ''">
          <svg v-if="stats.running > 0" class="h-3 w-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M6 2.5 10 8H2z" />
          </svg>
          <span class="font-mono tabular-nums">{{ stats.running }}</span>
          <span class="text-themed-muted">/ {{ stats.total }} {{ t('dashboard.totalInstances') }}</span>
        </div>
      </div>

      <!-- 账户余额 -->
      <div class="nimbus-card nimbus-metric overflow-hidden p-4 sm:p-5" :class="overviewShellClass" style="--i: 2">
        <div class="flex items-start justify-between gap-3">
          <span class="nimbus-tile-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <path d="M3 8V7a2 2 0 0 1 2-2h11" /><path d="M16.5 12.5h.01" />
            </svg>
          </span>
          <svg class="nimbus-spark" viewBox="0 0 60 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="0,14 10,15 20,11 30,12 40,7 50,9 60,5" />
          </svg>
        </div>
        <div class="mt-4 nimbus-metric-label">{{ t('dashboard.accountOverview') }}</div>
        <div class="mt-1 nimbus-metric-value font-mono tabular-nums">{{ formatCurrency(balanceOverview.balance) }}</div>
        <div class="mt-1.5 nimbus-metric-delta">
          <span class="text-themed-muted">{{ t('dashboard.totalRecharge') }}</span>
          <span class="font-mono tabular-nums text-themed">{{ formatCurrency(balanceOverview.totalRecharge || 0) }}</span>
        </div>
      </div>

      <!-- 用户积分 -->
      <div class="nimbus-card nimbus-metric overflow-hidden p-4 sm:p-5" :class="overviewShellClass" style="--i: 3">
        <div class="flex items-start justify-between gap-3">
          <span class="nimbus-tile-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3.5 14.4 8.6 20 9.4l-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.6-.8z" />
            </svg>
          </span>
          <svg class="nimbus-spark" viewBox="0 0 60 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="0,16 10,14 20,15 30,11 40,12 50,9 60,10" />
          </svg>
        </div>
        <div class="mt-4 nimbus-metric-label">{{ t('dashboard.userPoints') }}</div>
        <div class="mt-1 nimbus-metric-value font-mono tabular-nums">{{ formatPoints(userPoints) }}</div>
        <div class="mt-1.5 nimbus-metric-delta">
          <span class="text-themed-muted">{{ t('dashboard.memberLevel') }}</span>
          <span class="font-semibold text-themed">{{ formatUserVipLevel(userVipLevel) }}</span>
        </div>
      </div>
    </section>

    <!-- 两栏：账户总览（含会员进度） + 实例状态分布 -->
    <section data-reveal class="grid gap-4 lg:grid-cols-3">
      <!-- 左：账户总览 -->
      <div class="nimbus-card nimbus-card--hover p-5 sm:p-6 lg:col-span-2" :class="overviewShellClass">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="nimbus-eyebrow">{{ t('dashboard.accountOverview') }}</div>
            <div class="mt-3 break-all nimbus-hero-value font-mono tabular-nums">{{ formatCurrency(balanceOverview.balance) }}</div>
            <div class="mt-2 text-sm text-themed-muted">{{ accountPanelHint }}</div>
          </div>
          <span
            class="inline-flex max-w-[11rem] items-center rounded-full px-3 py-1.5 text-sm font-bold"
            :class="memberBadgeClass"
            :style="memberBadgeStyle"
          >
            {{ formatUserVipLevel(userVipLevel) }}
          </span>
        </div>

        <div class="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div
            v-for="item in balanceSummaryItems"
            :key="item.label"
            class="nimbus-inner rounded-xl border px-3.5 py-3"
            :class="subtlePanelClass"
          >
            <div class="text-xs text-themed-muted">{{ item.label }}</div>
            <div class="mt-1 truncate text-sm font-semibold text-themed">{{ item.value }}</div>
          </div>
        </div>

        <div class="nimbus-inner mt-4 rounded-xl border p-4" :class="subtlePanelClass">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-themed">{{ t('dashboard.vipProgressTitle') }}</div>
              <div class="mt-1 text-xs text-themed-muted">{{ vipProgressTargetText }}</div>
            </div>
            <div class="nimbus-pct inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold font-mono tabular-nums">
              {{ vipProgressPercent }}%
            </div>
          </div>

          <div class="nimbus-bar mt-4">
            <div class="nimbus-bar-fill" :style="vipProgressStyle"></div>
          </div>
          <div class="mt-2 text-xs text-themed-muted">{{ vipProgressHint }}</div>

          <div v-if="vipProgressConditions.length > 0" class="mt-4 grid gap-2" :class="vipProgressConditionGridClass">
            <div
              v-for="condition in vipProgressConditions"
              :key="condition.metric"
              class="nimbus-inner rounded-xl border px-3.5 py-3"
              :class="subtlePanelClass"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium text-themed-muted">{{ getVipProgressMetricLabel(condition.metric) }}</span>
                <span
                  class="rounded-full px-2 py-0.5 text-[11px] font-semibold font-mono tabular-nums"
                  :class="condition.matched ? 'nimbus-chip-ok' : 'nimbus-chip-idle'"
                >
                  {{ condition.progress }}%
                </span>
              </div>
              <div class="mt-3 grid gap-2 sm:grid-cols-3">
                <div class="min-w-0 rounded-lg px-2.5 py-2" :class="subtlePanelClass">
                  <div class="text-[11px] text-themed-muted">{{ t('dashboard.vipProgressCurrent') }}</div>
                  <div class="mt-1 truncate text-sm font-semibold text-themed font-mono tabular-nums">{{ formatVipProgressValue(condition, condition.current) }}</div>
                </div>
                <div class="min-w-0 rounded-lg px-2.5 py-2" :class="subtlePanelClass">
                  <div class="text-[11px] text-themed-muted">{{ t('dashboard.vipProgressTarget') }}</div>
                  <div class="mt-1 truncate text-sm font-semibold text-themed font-mono tabular-nums">{{ formatVipProgressValue(condition, condition.target) }}</div>
                </div>
                <div class="min-w-0 rounded-lg px-2.5 py-2" :class="subtlePanelClass">
                  <div class="text-[11px] text-themed-muted">{{ t('dashboard.vipProgressRemaining') }}</div>
                  <div
                    class="mt-1 truncate text-sm font-semibold font-mono tabular-nums"
                    :class="condition.matched ? 'nimbus-ok-text' : 'text-themed'"
                  >
                    {{ formatVipProgressRemaining(condition) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="availableLifecycleOffers.length > 0" class="nimbus-inner mt-4 rounded-xl border p-4" :class="subtlePanelClass">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div class="text-sm font-semibold text-themed">可用运营优惠</div>
              <div class="mt-1 text-xs text-themed-muted">管理员为您定向发放的资源兑换码。</div>
            </div>
            <RouterLink
              :to="{ path: entertainmentPath(), query: { tab: 'checkin' } }"
              class="nimbus-ghost-btn inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold"
            >
              去兑换
            </RouterLink>
          </div>
          <div class="mt-3 grid gap-2">
            <div
              v-for="offer in availableLifecycleOffers"
              :key="offer.id"
              class="nimbus-inner rounded-xl border px-3 py-2"
              :class="subtlePanelClass"
            >
              <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0">
                  <div class="truncate text-sm font-semibold text-themed font-mono">{{ offer.code }}</div>
                  <div class="text-xs text-themed-muted">{{ offer.host.name }} · {{ offer.codeType }} +{{ offer.codeValue }}{{ getLifecycleOfferUnit(offer.codeType) }}</div>
                </div>
                <div class="text-xs text-themed-muted">{{ offer.expiresAt ? new Date(offer.expiresAt).toLocaleDateString() : '长期有效' }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右：实例状态分布 -->
      <div class="nimbus-card nimbus-card--hover flex flex-col p-5 sm:p-6" :class="overviewShellClass">
        <div class="flex items-start justify-between gap-3">
          <div class="nimbus-eyebrow">{{ t('dashboard.instanceStatusOverview') }}</div>
          <RouterLink :to="instancesPath()" class="nimbus-link inline-flex items-center gap-1 text-xs font-medium">
            {{ t('dashboard.viewAll') }}
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </RouterLink>
        </div>

        <div class="mt-3 flex items-end gap-2">
          <div class="nimbus-hero-value font-mono tabular-nums leading-none">{{ stats.total }}</div>
          <div class="pb-1 text-sm text-themed-muted">{{ t('dashboard.totalInstances') }}</div>
        </div>

        <div class="mt-5 space-y-4">
          <div v-for="item in statusOverviewItems" :key="item.key">
            <div class="flex items-center justify-between text-xs">
              <span class="text-themed-muted">{{ item.label }}</span>
              <span class="font-mono tabular-nums text-themed">{{ item.value }}</span>
            </div>
            <div class="nimbus-bar mt-2">
              <div class="nimbus-bar-fill" :style="{ width: (stats.total ? Math.round((item.value / stats.total) * 100) : 0) + '%' }"></div>
            </div>
          </div>
          <div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-themed-muted">{{ t('dashboard.containerInstances') }}</span>
              <span class="font-mono tabular-nums text-themed">{{ instanceTypeStats.container }}</span>
            </div>
            <div class="nimbus-bar mt-2">
              <div class="nimbus-bar-fill" :style="{ width: (stats.total ? Math.round((instanceTypeStats.container / stats.total) * 100) : 0) + '%' }"></div>
            </div>
          </div>
          <div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-themed-muted">{{ t('dashboard.vmInstances') }}</span>
              <span class="font-mono tabular-nums text-themed">{{ instanceTypeStats.vm }}</span>
            </div>
            <div class="nimbus-bar mt-2">
              <div class="nimbus-bar-fill" :style="{ width: (stats.total ? Math.round((instanceTypeStats.vm / stats.total) * 100) : 0) + '%' }"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <PluginFrameSlot slot-name="user.dashboard.cards" surface="user" frame-class="min-h-[220px]" />

    <!-- 最近实例 -->
    <section data-reveal class="nimbus-card overflow-hidden" :class="overviewShellClass">
      <div class="nimbus-panel-head flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-base font-semibold text-themed">{{ $t('dashboard.myInstances') }}</h2>
          <p class="mt-1 text-xs text-themed-muted">{{ instanceListSummary }}</p>
        </div>
        <RouterLink
          :to="instancesPath()"
          class="nimbus-ghost-btn inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium"
        >
          {{ $t('dashboard.viewAll') }}
          <svg class="ml-1.5 h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </RouterLink>
      </div>

      <div v-if="loading" class="space-y-3 p-4 sm:p-5">
        <div
          v-for="i in 3"
          :key="i"
          class="nimbus-inner rounded-xl border p-4"
          :class="subtlePanelClass"
        >
          <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div class="flex items-center gap-3">
              <Skeleton type="circle" size="44px" />
              <div class="min-w-0 flex-1 space-y-2">
                <Skeleton type="line" width="150px" height="15px" />
                <Skeleton type="line" width="210px" height="11px" />
              </div>
            </div>
            <div class="flex flex-wrap gap-2 lg:justify-end">
              <Skeleton v-for="metric in 3" :key="metric" type="line" width="74px" height="28px" />
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="instances.length === 0" class="p-10 text-center">
        <div class="nimbus-empty-icon mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
          <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
          </svg>
        </div>
        <p class="mb-4 text-sm text-themed-muted">{{ $t('dashboard.noInstances') }}</p>
        <RouterLink :to="instanceCreatePath()" class="btn-primary btn-sm">{{ configStore.freeSiteMode ? freeSiteCopy.dashboardCreateFirst : $t('dashboard.createFirst') }}</RouterLink>
      </div>

      <div v-else class="space-y-2.5 p-4 sm:p-5">
        <RouterLink
          v-for="instance in recentInstances"
          :key="instance.id"
          :to="instanceDetailPath(instance.id)"
          class="nimbus-row group relative block overflow-hidden rounded-xl border p-4"
          :class="getInstanceRowClass()"
        >
          <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0 flex-1">
              <div class="flex items-start gap-3">
                <div class="nimbus-row-icon flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl sm:h-12 sm:w-12">
                  <InstanceDisplayIcon
                    v-if="instance.iconBadgeId || getPaidIconType(instance)"
                    :badge-id="instance.iconBadgeId"
                    :fallback-icon="getPaidIconType(instance)"
                    :alt="instance.name"
                    :size="48"
                  />
                  <DistroIcon
                    v-else
                    :distro="getDistroFromName(instance.image)"
                    :size="26"
                  />
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="nimbus-row-name max-w-full truncate text-sm sm:text-[15px]">{{ instance.name }}</span>
                    <span :class="['badge inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] sm:text-[11px] flex-shrink-0', getStatusInfo(instance.status, t).class]">
                      <span :class="['h-1.5 w-1.5 rounded-full', getStatusInfo(instance.status, t).dot]"></span>
                      {{ getStatusInfo(instance.status, t).label }}
                    </span>
                    <span class="nimbus-chip-idle inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium sm:text-[11px]">
                      {{ getInstanceTypeLabel(instance) }}
                    </span>
                  </div>

                  <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-themed-muted">
                    <span class="max-w-[14rem] truncate font-mono sm:max-w-[22rem]">{{ formatImageName(instance.image, (instance as any).imageName) }}</span>
                    <span class="nimbus-dot">•</span>
                    <span class="font-mono tabular-nums text-themed">CPU {{ instance.cpu }}%</span>
                    <span class="nimbus-dot">•</span>
                    <span class="font-mono text-themed">{{ formatMemory(instance.memory) }}</span>
                    <span class="nimbus-dot">•</span>
                    <span class="font-mono text-themed">{{ formatDisk(instance.disk) }}</span>
                  </div>

                  <div class="nimbus-load mt-2.5 max-w-md">
                    <div
                      class="nimbus-load-fill"
                      :class="{
                        'nimbus-load-fill--danger': instance.cpu > 85,
                        'nimbus-load-fill--warn': instance.cpu > 60 && instance.cpu <= 85
                      }"
                      :style="{ width: Math.min(Math.max(instance.cpu, 0), 100) + '%' }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 lg:justify-end lg:pl-4">
              <span class="nimbus-meta-chip inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px]">
                <FlagIcon :code="instance.host?.country_code || instance.hostCountryCode || 'us'" size="xs" />
                <span class="max-w-[8rem] truncate">{{ getHostName(instance) }}</span>
              </span>
              <span class="nimbus-meta-chip inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-mono">
                {{ getDisplayIp(instance) || $t('dashboard.noPublicIp') }}
              </span>
              <div class="nimbus-row-chevron hidden h-9 w-9 items-center justify-center rounded-lg lg:flex">
                <svg class="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        </RouterLink>
      </div>

      <div v-if="instances.length > 5" class="nimbus-panel-foot border-t px-5 py-3 text-center">
        <RouterLink :to="instancesPath()" class="nimbus-link text-sm">
          {{ $t('dashboard.viewAllInstancesWithCount', { count: instances.length }) }} →
        </RouterLink>
      </div>
    </section>
  </div>
</template>
<style scoped>
/* ============================================================
   Nimbus console · 结构化仪表盘（白底为主 + 单一靛蓝信号色）
   颜色全部走 --kawaii-* token，随 .light/.dark 自动明暗切换。
   ============================================================ */

/* --- 卡片外壳 --- */
.nimbus-card {
  position: relative;
  border: 1px solid var(--kawaii-line);
  border-radius: 14px;
  box-shadow: var(--kawaii-shadow);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.nimbus-card--hover:hover {
  transform: translateY(-2px);
  border-color: var(--kawaii-line-strong);
  box-shadow: 0 10px 30px -12px rgb(15 23 42 / 0.22);
}

/* --- 页头图标按钮 --- */
.nimbus-icon-btn {
  color: var(--kawaii-primary);
  background: color-mix(in srgb, var(--kawaii-primary) 10%, transparent);
  transition: background 0.18s ease, transform 0.18s ease;
}
.nimbus-icon-btn:hover {
  background: color-mix(in srgb, var(--kawaii-primary) 18%, transparent);
}

/* --- 指标卡 --- */
.nimbus-metric {
  animation: nimbusRise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--i, 0) * 70ms);
}

.nimbus-tile-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  color: var(--kawaii-primary);
  background: color-mix(in srgb, var(--kawaii-primary) 12%, transparent);
}
.nimbus-tile-icon svg {
  width: 21px;
  height: 21px;
}

.nimbus-spark {
  width: 58px;
  height: 22px;
  color: var(--kawaii-primary);
  opacity: 0.4;
  flex-shrink: 0;
}

.nimbus-metric-label {
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--kawaii-muted);
}

.nimbus-metric-value {
  font-size: 1.75rem;
  line-height: 1.1;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--kawaii-text);
}

.nimbus-metric-delta {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: var(--kawaii-faint);
}
.nimbus-metric-delta--up {
  color: var(--kawaii-mint);
}

/* --- 大标题数字 / 眉标 --- */
.nimbus-eyebrow {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kawaii-muted);
}

.nimbus-hero-value {
  font-size: 2rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--kawaii-text);
}
@media (min-width: 640px) {
  .nimbus-hero-value {
    font-size: 2.25rem;
  }
}

/* --- 内层面板圆角对齐 --- */
.nimbus-inner {
  border-radius: 12px;
}

/* --- 进度条（会员成长 / 状态分布），靛蓝填充 --- */
.nimbus-bar {
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--kawaii-muted) 16%, transparent);
}
.nimbus-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--kawaii-primary);
  transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.nimbus-pct {
  color: var(--kawaii-primary-strong);
  background: color-mix(in srgb, var(--kawaii-primary) 13%, transparent);
}

/* 语义 chip：已满足=绿，默认=中性 */
.nimbus-chip-ok {
  color: var(--kawaii-mint);
  background: color-mix(in srgb, var(--kawaii-mint) 15%, transparent);
}
.nimbus-chip-idle {
  color: var(--kawaii-muted);
  background: color-mix(in srgb, var(--kawaii-muted) 12%, transparent);
}
.nimbus-ok-text {
  color: var(--kawaii-mint);
}

/* --- 链接 / 幽灵按钮 --- */
.nimbus-link {
  color: var(--kawaii-primary);
  transition: color 0.18s ease;
}
.nimbus-link:hover {
  color: var(--kawaii-primary-strong);
}

.nimbus-ghost-btn {
  border-color: var(--kawaii-line);
  color: var(--kawaii-muted);
  background: var(--kawaii-surface);
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
}
.nimbus-ghost-btn:hover {
  color: var(--kawaii-text);
  border-color: var(--kawaii-line-strong);
  background: var(--kawaii-surface-soft);
}

/* --- 面板头/脚分隔线 --- */
.nimbus-panel-head,
.nimbus-panel-foot {
  border-color: var(--kawaii-line);
}

/* --- 最近实例行 --- */
.nimbus-row {
  border-radius: 12px !important;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}
.nimbus-row:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 22px -14px rgb(15 23 42 / 0.28);
}

.nimbus-row-name {
  font-weight: 620;
  color: var(--kawaii-text);
}

.nimbus-row-icon {
  color: var(--kawaii-muted);
  background: color-mix(in srgb, var(--kawaii-muted) 12%, transparent);
  transition: background 0.18s ease, color 0.18s ease;
}
.nimbus-row:hover .nimbus-row-icon {
  color: var(--kawaii-primary);
  background: color-mix(in srgb, var(--kawaii-primary) 12%, transparent);
}

.nimbus-dot {
  color: color-mix(in srgb, var(--kawaii-muted) 55%, transparent);
}

.nimbus-meta-chip {
  color: var(--kawaii-muted);
  background: color-mix(in srgb, var(--kawaii-muted) 10%, transparent);
}

.nimbus-row-chevron {
  color: var(--kawaii-faint);
  background: color-mix(in srgb, var(--kawaii-muted) 10%, transparent);
  transition: background 0.18s ease, color 0.18s ease;
}
.nimbus-row:hover .nimbus-row-chevron {
  color: var(--kawaii-primary);
  background: color-mix(in srgb, var(--kawaii-primary) 12%, transparent);
}

/* --- 实例负载条：CPU 真实占用，>85% 转红，>60% 转琥珀 --- */
.nimbus-load {
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--kawaii-muted) 14%, transparent);
}
.nimbus-load-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--kawaii-primary);
  transition: width 0.4s ease;
}
.nimbus-load-fill--warn {
  background: var(--kawaii-amber);
}
.nimbus-load-fill--danger {
  background: #dc2626;
}

/* --- 空状态图标 --- */
.nimbus-empty-icon {
  color: var(--kawaii-faint);
  background: color-mix(in srgb, var(--kawaii-muted) 12%, transparent);
}

/* --- 入场动画（尊重减少动态） --- */
@keyframes nimbusRise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nimbus-metric {
    animation: none;
  }
  .nimbus-card--hover:hover,
  .nimbus-row:hover {
    transform: none;
  }
  .nimbus-bar-fill,
  .nimbus-load-fill {
    transition: none;
  }
}
</style>
