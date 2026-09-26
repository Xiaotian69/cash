export type Category = 'cash' | 'bank' | 'credit' | 'virtual' | 'investment' | 'liability' | 'custom'
export type ChartMode = 'asset' | 'liability' | 'net'
export type Range = '30d' | '90d' | 'year' | 'all'

export interface Account {
  id: string
  name: string
  category: Category
  balance: number
  note: string
  icon: string
  createdAt: string
  updatedAt: string
}

export interface SnapshotAccount {
  id: string
  name: string
  category: Category
  balance: number
}

export interface Snapshot {
  date: string
  totalAssets: number
  totalLiabilities: number
  netAssets: number
  accounts: SnapshotAccount[]
}

export interface Settings {
  currencySymbol: string
}

export const CATEGORIES: { id: Category; label: string; color: string }[] = [
  { id: 'cash', label: '现金', color: '#edbb54' },
  { id: 'bank', label: '储蓄卡', color: '#8985f4' },
  { id: 'credit', label: '信用账户', color: '#e9a06b' },
  { id: 'virtual', label: '虚拟账户', color: '#50b9d8' },
  { id: 'investment', label: '投资账户', color: '#54bea2' },
  { id: 'liability', label: '负债', color: '#f07786' },
  { id: 'custom', label: '自定义资产', color: '#ac9ee4' },
]

export function isLiability(category: Category): boolean {
  return category === 'credit' || category === 'liability'
}

export function calculateTotals(accounts: Pick<Account, 'balance' | 'category'>[]): Pick<Snapshot, 'totalAssets' | 'totalLiabilities' | 'netAssets'> {
  let assetsInCents = 0
  let liabilitiesInCents = 0

  for (const account of accounts) {
    const cents = Math.round(account.balance * 100)
    if (isLiability(account.category)) liabilitiesInCents += cents
    else assetsInCents += cents
  }

  return {
    totalAssets: assetsInCents / 100,
    totalLiabilities: liabilitiesInCents / 100,
    netAssets: (assetsInCents - liabilitiesInCents) / 100,
  }
}

export function categoryTotals(accounts: Account[], kind: 'asset' | 'liability'): { category: Category; amount: number }[] {
  const sums = new Map<Category, number>()
  for (const account of accounts) {
    if (isLiability(account.category) !== (kind === 'liability')) continue
    sums.set(account.category, (sums.get(account.category) ?? 0) + Math.round(account.balance * 100))
  }
  return [...sums.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([category, cents]) => ({ category, amount: cents / 100 }))
    .sort((a, b) => b.amount - a.amount)
}

export function createSnapshot(accounts: Account[], date: string): Snapshot {
  return {
    date,
    ...calculateTotals(accounts),
    accounts: accounts.map(({ id, name, category, balance }) => ({ id, name, category, balance })),
  }
}

export function parseBalance(value: string): number | null {
  const trimmed = value.trim()
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(trimmed)) return null
  const amount = Number(trimmed)
  return Number.isSafeInteger(Math.round(amount * 100)) ? Math.round(amount * 100) / 100 : null
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.round(amount * 100) / 100)
}

export function formatMoney(amount: number, symbol: string): string {
  return `${amount < 0 ? '-' : ''}${symbol}${formatNumber(Math.abs(amount))}`
}

export function formatLastUpdated(accounts: Pick<Account, 'updatedAt'>[], now = new Date()): string {
  if (accounts.length === 0) return '暂无更新'
  const latest = new Date(Math.max(...accounts.map((account) => new Date(account.updatedAt).getTime())))
  const time = `${String(latest.getHours()).padStart(2, '0')}:${String(latest.getMinutes()).padStart(2, '0')}`
  if (localDateKey(latest) === localDateKey(now)) return `今天 ${time}`
  const date = latest.getFullYear() === now.getFullYear()
    ? `${latest.getMonth() + 1}月${latest.getDate()}日`
    : `${latest.getFullYear()}年${latest.getMonth() + 1}月${latest.getDate()}日`
  return `${date} ${time}`
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function filterSnapshots(snapshots: Snapshot[], range: Range, today = new Date()): Snapshot[] {
  if (range === 'all') return [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  let start: string
  if (range === 'year') {
    start = `${today.getFullYear()}-01-01`
  } else {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    date.setDate(date.getDate() - (range === '30d' ? 29 : 89))
    start = localDateKey(date)
  }
  return snapshots.filter((snapshot) => snapshot.date >= start && snapshot.date <= localDateKey(today))
    .sort((a, b) => a.date.localeCompare(b.date))
}
