import { describe, expect, it } from 'vitest'
import {
  calculateTotals,
  categoryTotals,
  createSnapshot,
  filterSnapshots,
  formatMoney,
  formatNumber,
  formatLastUpdated,
  parseBalance,
  type Account,
  type Snapshot,
} from './domain'

const account = (id: string, category: Account['category'], balance: number): Account => ({
  id,
  name: id,
  category,
  balance,
  note: '',
  icon: 'default',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
})

describe('asset calculations', () => {
  const accounts = [
    account('工商银行', 'bank', 1250.2),
    account('建设银行', 'bank', 12000.25),
    account('招商银行', 'bank', 1549.4),
    account('蚂蚁花呗', 'credit', 800.15),
    account('微信', 'virtual', 600.45),
    account('基金', 'investment', 3500.35),
    account('分期余额', 'liability', 2400),
  ]

  it('adds assets and positive stored debts without floating point drift', () => {
    expect(calculateTotals(accounts)).toEqual({
      totalAssets: 18900.65,
      totalLiabilities: 3200.15,
      netAssets: 15700.50,
    })
  })

  it('separates asset and debt categories', () => {
    expect(categoryTotals(accounts, 'asset')).toEqual([
      { category: 'bank', amount: 14799.85 },
      { category: 'investment', amount: 3500.35 },
      { category: 'virtual', amount: 600.45 },
    ])
    expect(categoryTotals(accounts, 'liability')).toEqual([
      { category: 'liability', amount: 2400 },
      { category: 'credit', amount: 800.15 },
    ])
  })

  it('copies current account balances into a dated snapshot', () => {
    const snapshot = createSnapshot(accounts, '2026-09-26')
    expect(snapshot.date).toBe('2026-09-26')
    expect(snapshot.netAssets).toBe(15700.50)
    expect(snapshot.accounts).toHaveLength(7)
    expect(snapshot.accounts[0].balance).toBe(1250.2)
  })
})

describe('balance input', () => {
  it('accepts zero and two decimal places', () => {
    expect(parseBalance('0')).toBe(0)
    expect(parseBalance(' 7450.50 ')).toBe(7450.5)
  })

  it('rejects negatives, extra decimals and non-numeric input', () => {
    expect(parseBalance('-1')).toBeNull()
    expect(parseBalance('1.234')).toBeNull()
    expect(parseBalance('abc')).toBeNull()
    expect(parseBalance('')).toBeNull()
  })
})

describe('amount display', () => {
  it('shows two decimals, thousands separators and the chosen currency symbol', () => {
    expect(formatMoney(1250.2, '¥')).toBe('¥1,250.20')
    expect(formatMoney(-2400, '¥')).toBe('-¥2,400.00')
    expect(formatNumber(15700.50)).toBe('15,700.50')
  })

  it('describes the newest account update in local time', () => {
    const now = new Date(2026, 8, 26, 14, 0)
    expect(formatLastUpdated([], now)).toBe('暂无更新')
    expect(formatLastUpdated([{ ...account('old', 'bank', 1), updatedAt: new Date(2026, 8, 25, 9, 0).toISOString() }, { ...account('new', 'bank', 2), updatedAt: new Date(2026, 8, 26, 12, 30).toISOString() }], now)).toBe('今天 12:30')
  })
})

describe('history ranges', () => {
  const snapshot = (date: string): Snapshot => ({
    date,
    totalAssets: 100,
    totalLiabilities: 0,
    netAssets: 100,
    accounts: [],
  })

  it('keeps the last 30 calendar days including today', () => {
    const rows = [snapshot('2026-08-27'), snapshot('2026-08-28'), snapshot('2026-09-26')]
    expect(filterSnapshots(rows, '30d', new Date(2026, 8, 26))).toEqual(rows.slice(1))
  })

  it('keeps all dates in the current year', () => {
    const rows = [snapshot('2025-12-31'), snapshot('2026-01-01')]
    expect(filterSnapshots(rows, 'year', new Date(2026, 8, 26))).toEqual(rows.slice(1))
  })
})
