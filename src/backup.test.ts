import { describe, expect, it } from 'vitest'
import { createDemoData } from './demo'
import { createBackup, parseBackup } from './backup'
import type { AppData } from './storage'

function sample(): AppData {
  const demo = createDemoData()
  return { accounts: demo.accounts, snapshots: [demo.snapshot], transactions: [], settings: { currencySymbol: '¥' } }
}

describe('JSON backup', () => {
  it('round trips accounts, balances and snapshots', () => {
    const data = sample()
    const json = JSON.stringify(createBackup(data, '2026-09-26T00:00:00.000Z'))
    expect(parseBackup(json)).toEqual(data)
  })

  it('accepts older backups without a transactions field', () => {
    const backup: Record<string, unknown> = { ...createBackup(sample()) }
    delete backup.transactions
    expect(parseBackup(JSON.stringify(backup)).transactions).toEqual([])
  })

  it('round trips ledger entries and rejects an invalid balance effect', () => {
    const data = sample()
    data.transactions.push({ id: 'transaction-1', type: 'expense', amount: 30, category: '饮食', subcategory: '麦当劳', accountId: data.accounts[0].id, accountName: data.accounts[0].name, date: '2026-09-26', note: '', syncBalance: true, balanceDelta: -30, createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z' })
    expect(parseBackup(JSON.stringify(createBackup(data)))).toEqual(data)
    data.transactions[0].balanceDelta = -20
    expect(() => parseBackup(JSON.stringify(createBackup(data)))).toThrow('联动')
  })

  it('preserves an entry linked to a deleted account in a backup', () => {
    const data = sample()
    data.transactions.push({ id: 'former', type: 'expense', amount: 30, category: '饮食', subcategory: '', accountId: 'deleted-account', accountName: '已删除的微信', accountDeleted: true, date: '2026-09-26', note: '', syncBalance: true, balanceDelta: -30, createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z' })
    expect(parseBackup(JSON.stringify(createBackup(data))).transactions[0]).toEqual(data.transactions[0])
  })

  it('rejects a negative balance effect for income', () => {
    const data = sample()
    data.transactions.push({ id: 'transaction-income', type: 'income', amount: 30, category: '生活费', subcategory: '', accountId: data.accounts[0].id, accountName: data.accounts[0].name, date: '2026-09-26', note: '', syncBalance: true, balanceDelta: -30, createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z' })
    expect(() => parseBackup(JSON.stringify(createBackup(data)))).toThrow('联动')
  })

  it('rejects malformed JSON and unknown versions', () => {
    expect(() => parseBackup('{')).toThrow('JSON')
    expect(() => parseBackup(JSON.stringify({ ...createBackup(sample()), version: 99 }))).toThrow('版本')
  })

  it('rejects negative stored debt balances', () => {
    const backup = createBackup(sample())
    backup.accounts.find((item) => item.category === 'liability')!.balance = -2400
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('余额')
  })

  it('rejects duplicate accounts and inconsistent historical totals', () => {
    const duplicate = createBackup(sample())
    duplicate.accounts.push({ ...duplicate.accounts[0] })
    expect(() => parseBackup(JSON.stringify(duplicate))).toThrow('重复')

    const inaccurate = createBackup(sample())
    inaccurate.snapshots[0].netAssets = 999
    expect(() => parseBackup(JSON.stringify(inaccurate))).toThrow('快照')
  })

  it('rejects a currency symbol the settings page cannot display', () => {
    const backup = createBackup(sample())
    backup.settings.currencySymbol = 'BTC'
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('货币符号')
  })

  it('round trips an exported backup larger than 10 MiB', () => {
    const data = sample()
    const entry = { id: '', type: 'expense' as const, amount: 1, category: '饮食', subcategory: '', accountId: data.accounts[0].id, accountName: data.accounts[0].name, date: '2026-09-26', note: 'x'.repeat(200), syncBalance: false, balanceDelta: 0, createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z' }
    data.transactions = Array.from({ length: 30000 }, (_, index) => ({ ...entry, id: `ledger-${index}` }))
    const json = JSON.stringify(createBackup(data), null, 2)
    expect(new Blob([json]).size).toBeGreaterThan(10 * 1024 * 1024)
    expect(parseBackup(json).transactions).toHaveLength(30000)
  })
})
