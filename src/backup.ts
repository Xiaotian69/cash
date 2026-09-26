import { CATEGORIES, calculateTotals, type Account, type Snapshot, type SnapshotAccount } from './domain'
import type { AppData } from './storage'
import { validateTransactionDraft, type Transaction } from './ledger'

export interface BackupFile extends AppData {
  format: 'personal-asset-manager'
  version: 1
  exportedAt: string
}

export function createBackup(data: AppData, exportedAt = new Date().toISOString()): BackupFile {
  return { format: 'personal-asset-manager', version: 1, exportedAt, ...data }
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name}格式不正确`)
  return value as Record<string, unknown>
}

function text(value: unknown, name: string, maxLength: number, optional = false): string {
  if (typeof value !== 'string' || value.length > maxLength || (!optional && !value.trim())) throw new Error(`${name}格式不正确`)
  return value
}

function money(value: unknown, name: string, allowNegative = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (!allowNegative && value < 0) ||
    !Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) {
    throw new Error(`${name}余额或金额不正确`)
  }
  return value
}

function category(value: unknown): Account['category'] {
  if (!CATEGORIES.some((item) => item.id === value)) throw new Error('账户类型不正确')
  return value as Account['category']
}

function dateKey(value: unknown): string {
  const key = text(value, '快照日期', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(Date.parse(`${key}T00:00:00Z`)) || new Date(`${key}T00:00:00Z`).toISOString().slice(0, 10) !== key) {
    throw new Error('快照日期不正确')
  }
  return key
}

function timestamp(value: unknown, name: string): string {
  const result = text(value, name, 50)
  if (Number.isNaN(Date.parse(result))) throw new Error(`${name}不正确`)
  return result
}

function snapshotAccount(value: unknown): SnapshotAccount {
  const item = record(value, '快照账户')
  return {
    id: text(item.id, '快照账户 ID', 100),
    name: text(item.name, '快照账户名称', 80),
    category: category(item.category),
    balance: money(item.balance, '快照账户'),
  }
}

function account(value: unknown): Account {
  const item = record(value, '账户')
  return {
    ...snapshotAccount(item),
    note: text(item.note, '备注', 200, true),
    icon: text(item.icon, '图标', 50, true),
    createdAt: timestamp(item.createdAt, '创建时间'),
    updatedAt: timestamp(item.updatedAt, '更新时间'),
  }
}

function snapshot(value: unknown): Snapshot {
  const item = record(value, '快照')
  if (!Array.isArray(item.accounts)) throw new Error('快照账户列表不正确')
  const accounts = item.accounts.map(snapshotAccount)
  if (new Set(accounts.map((member) => member.id)).size !== accounts.length) throw new Error('快照中有重复账户')
  const totals = calculateTotals(accounts)
  const saved = {
    totalAssets: money(item.totalAssets, '快照资产'),
    totalLiabilities: money(item.totalLiabilities, '快照负债'),
    netAssets: money(item.netAssets, '快照净资产', true),
  }
  if (Math.round(saved.totalAssets * 100) !== Math.round(totals.totalAssets * 100) ||
    Math.round(saved.totalLiabilities * 100) !== Math.round(totals.totalLiabilities * 100) ||
    Math.round(saved.netAssets * 100) !== Math.round(totals.netAssets * 100)) throw new Error('快照合计与账户余额不一致')
  return { date: dateKey(item.date), ...saved, accounts }
}

function ledgerTransaction(value: unknown): Transaction {
  const item = record(value, '流水')
  const type = item.type
  if (type !== 'expense' && type !== 'income') throw new Error('流水类型不正确')
  if (typeof item.syncBalance !== 'boolean') throw new Error('流水余额同步标记不正确')
  if (item.accountDeleted !== undefined && typeof item.accountDeleted !== 'boolean') throw new Error('流水账户状态不正确')
  const result: Transaction = {
    id: text(item.id, '流水 ID', 100),
    type,
    amount: money(item.amount, '流水金额'),
    category: text(item.category, '流水分类', 40),
    subcategory: text(item.subcategory, '流水小类', 80, true),
    accountId: text(item.accountId, '流水账户 ID', 100),
    accountName: text(item.accountName, '流水账户名称', 80),
    date: dateKey(item.date),
    note: text(item.note, '流水备注', 200, true),
    syncBalance: item.syncBalance,
    balanceDelta: money(item.balanceDelta, '流水余额变动', true),
    ...(item.accountDeleted === true ? { accountDeleted: true } : {}),
    createdAt: timestamp(item.createdAt, '流水创建时间'),
    updatedAt: timestamp(item.updatedAt, '流水更新时间'),
  }
  validateTransactionDraft(result)
  if (result.syncBalance ? Math.round(Math.abs(result.balanceDelta) * 100) !== Math.round(result.amount * 100) : result.balanceDelta !== 0) throw new Error('流水余额联动信息不正确')
  if (result.type === 'income' && result.balanceDelta < 0) throw new Error('流水余额联动信息不正确')
  return result
}

export function parseBackup(json: string): AppData {
  let parsed: unknown
  try { parsed = JSON.parse(json) }
  catch { throw new Error('JSON 文件无法解析') }
  const backup = record(parsed, '备份文件')
  if (backup.format !== 'personal-asset-manager' || backup.version !== 1) throw new Error('备份格式或版本不受支持')
  timestamp(backup.exportedAt, '导出时间')
  if (!Array.isArray(backup.accounts) || !Array.isArray(backup.snapshots) || (backup.transactions !== undefined && !Array.isArray(backup.transactions))) throw new Error('备份中的账户、流水或历史数据不完整')
  if (backup.accounts.length > 10000 || backup.snapshots.length > 100000 || ((backup.transactions as unknown[] | undefined)?.length ?? 0) > 100000) throw new Error('备份数据过大')
  const accounts = backup.accounts.map(account)
  const snapshots = backup.snapshots.map(snapshot)
  const transactions = ((backup.transactions as unknown[] | undefined) ?? []).map(ledgerTransaction)
  if (new Set(accounts.map((item) => item.id)).size !== accounts.length) throw new Error('备份中有重复账户')
  if (new Set(snapshots.map((item) => item.date)).size !== snapshots.length) throw new Error('备份中有重复快照日期')
  if (new Set(transactions.map((item) => item.id)).size !== transactions.length) throw new Error('备份中有重复流水')
  const settings = record(backup.settings, '货币设置')
  const currencySymbol = text(settings.currencySymbol, '货币符号', 4)
  if (!['¥', '$', '€', '£'].includes(currencySymbol)) throw new Error('货币符号不受支持')
  return { accounts, snapshots, transactions, settings: { currencySymbol } }
}
