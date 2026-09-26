import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { calculateTotals, localDateKey } from './domain'
import { createRepository } from './storage'

const repository = () => createRepository(`asset-manager-test-${crypto.randomUUID()}`)

describe('local account storage', () => {
  it('upgrades a version 1 database without losing existing accounts', async () => {
    const databaseName = `asset-manager-upgrade-${crypto.randomUUID()}`
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      database.createObjectStore('accounts', { keyPath: 'id' })
      database.createObjectStore('snapshots', { keyPath: 'date' })
      database.createObjectStore('settings', { keyPath: 'key' })
      database.createObjectStore('meta', { keyPath: 'key' })
    }
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const transaction = database.transaction(['accounts', 'meta'], 'readwrite')
    transaction.objectStore('accounts').put({ id: 'existing', name: '旧账户', category: 'bank', balance: 88, note: '', icon: 'auto', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' })
    transaction.objectStore('meta').put({ key: 'initialized', value: true })
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error) })
    database.close()
    const upgraded = await createRepository(databaseName).load()
    expect(upgraded.accounts.map((account) => account.name)).toEqual(['旧账户'])
    expect(upgraded.transactions).toEqual([])
  })

  it('starts empty and keeps existing accounts across openings', async () => {
    const repo = repository()
    const first = await repo.load()
    expect(first.accounts).toEqual([])
    expect(first.snapshots).toEqual([])
    await repo.saveAccount({ id: 'bank-1', name: '建设银行', category: 'bank', balance: 12000.25, note: '', icon: 'ccb', createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z' })
    const second = await repo.load()
    expect(second.accounts).toHaveLength(1)
    expect(calculateTotals(second.accounts).netAssets).toBe(12000.25)
  })

  it('stores a changed balance and replaces today’s snapshot', async () => {
    const repo = repository()
    await repo.load()
    const bank = { id: 'bank-1', name: '建设银行', category: 'bank' as const, balance: 12000.25, note: '', icon: 'ccb', createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z' }
    await repo.saveAccount(bank)
    await repo.saveAccount({ ...bank, balance: 7450, updatedAt: new Date().toISOString() })
    const after = await repo.load()
    expect(after.accounts.find((item) => item.id === bank.id)?.balance).toBe(7450)
    expect(after.snapshots).toHaveLength(1)
    expect(after.snapshots[0].date).toBe(localDateKey())
    expect(after.snapshots[0].totalAssets).toBe(7450)
  })

  it('deletes an account and updates the current snapshot', async () => {
    const repo = repository()
    await repo.load()
    await repo.saveAccount({ id: 'debt-1', name: '分期余额', category: 'liability', balance: 2400, note: '', icon: 'debt', createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z' })
    await repo.deleteAccount('debt-1')
    const after = await repo.load()
    expect(after.accounts).toHaveLength(0)
    expect(after.snapshots[0].totalLiabilities).toBe(0)
  })

  it('keeps linked history usable after an account is deleted', async () => {
    const repo = repository()
    await repo.load()
    const timestamp = new Date().toISOString()
    await repo.saveAccount({ id: 'old', name: '旧微信', category: 'virtual', balance: 500, note: '', icon: 'auto', createdAt: timestamp, updatedAt: timestamp })
    await repo.saveAccount({ id: 'new', name: '新银行卡', category: 'bank', balance: 200, note: '', icon: 'auto', createdAt: timestamp, updatedAt: timestamp })
    const draft = { type: 'expense' as const, amount: 30, category: '饮食', subcategory: '', accountId: 'old', date: localDateKey(), note: '', syncBalance: true }
    await repo.saveTransaction(draft)
    const original = (await repo.load()).transactions[0]
    await repo.deleteAccount('old')
    const afterDelete = await repo.load()
    expect(afterDelete.transactions[0]).toMatchObject({ accountId: 'old', accountName: '旧微信', accountDeleted: true, balanceDelta: -30 })
    expect(afterDelete.snapshots[0].totalAssets).toBe(200)
    await expect(repo.deleteTransaction(original.id, true)).rejects.toThrow('已删除')
    await repo.saveTransaction({ ...draft, accountId: 'new', amount: 50 }, original.id)
    const afterEdit = await repo.load()
    expect(afterEdit.accounts[0].balance).toBe(150)
    expect(afterEdit.transactions[0].accountDeleted).toBeUndefined()
    await repo.deleteTransaction(original.id, true)
    expect((await repo.load()).accounts[0].balance).toBe(200)
  })

  it('keeps an intentionally cleared database empty on reopening', async () => {
    const repo = repository()
    await repo.load()
    await repo.clear()
    const after = await repo.load()
    expect(after.accounts).toEqual([])
    expect(after.snapshots).toEqual([])
  })

  it('replaces accounts, settings and history together on restore', async () => {
    const repo = repository()
    const original = await repo.load()
    await repo.clear()
    await repo.replaceData({ ...original, settings: { currencySymbol: '$' } })
    const restored = await repo.load()
    expect(restored.accounts).toEqual(original.accounts)
    expect(restored.snapshots).toEqual(original.snapshots)
    expect(restored.settings.currencySymbol).toBe('$')
  })

  it('atomically saves expenses and income with account balances and the current snapshot', async () => {
    const repo = repository()
    await repo.load()
    const timestamp = new Date().toISOString()
    await repo.saveAccount({ id: 'wechat', name: '微信', category: 'virtual', balance: 500, note: '', icon: 'wechat', createdAt: timestamp, updatedAt: timestamp })
    await repo.saveAccount({ id: 'huabei', name: '花呗', category: 'credit', balance: 1000, note: '', icon: 'huabei', createdAt: timestamp, updatedAt: timestamp })
    await repo.saveAccount({ id: 'ccb', name: '建设银行', category: 'bank', balance: 5000, note: '', icon: 'ccb', createdAt: timestamp, updatedAt: timestamp })
    const date = localDateKey()
    const base = { date, subcategory: '', note: '', syncBalance: true }
    await repo.saveTransaction({ ...base, type: 'expense', amount: 30, category: '饮食', subcategory: '麦当劳', accountId: 'wechat' })
    await repo.saveTransaction({ ...base, type: 'expense', amount: 200, category: '购物', accountId: 'huabei' })
    await repo.saveTransaction({ ...base, type: 'income', amount: 1500, category: '生活费', accountId: 'ccb' })
    const data = await repo.load()
    expect(Object.fromEntries(data.accounts.map((account) => [account.id, account.balance]))).toEqual({ wechat: 470, huabei: 1200, ccb: 6500 })
    expect(Object.fromEntries(data.transactions.map((transaction) => [transaction.accountId, transaction.balanceDelta]))).toEqual({ wechat: -30, huabei: 200, ccb: 1500 })
    expect(data.snapshots).toHaveLength(1)
    expect(calculateTotals(data.accounts)).toEqual({ totalAssets: 6970, totalLiabilities: 1200, netAssets: 5770 })
  })

  it('saves a backdated unsynced expense without touching balance or snapshots', async () => {
    const repo = repository()
    await repo.load()
    const timestamp = new Date().toISOString()
    await repo.saveAccount({ id: 'wechat', name: '微信', category: 'virtual', balance: 500, note: '', icon: 'wechat', createdAt: timestamp, updatedAt: timestamp })
    const before = await repo.load()
    await repo.saveTransaction({ type: 'expense', amount: 20, category: '饮食', subcategory: '', accountId: 'wechat', date: '2026-09-25', note: '', syncBalance: false })
    const after = await repo.load()
    expect(after.accounts).toEqual(before.accounts)
    expect(after.snapshots).toEqual(before.snapshots)
    expect(after.transactions).toHaveLength(1)
  })

  it('reverses the old effect before editing or deleting a synced expense', async () => {
    const repo = repository()
    await repo.load()
    const timestamp = new Date().toISOString()
    await repo.saveAccount({ id: 'wechat', name: '微信', category: 'virtual', balance: 500, note: '', icon: 'wechat', createdAt: timestamp, updatedAt: timestamp })
    const draft = { type: 'expense' as const, amount: 50, category: '饮食', subcategory: '', accountId: 'wechat', date: localDateKey(), note: '', syncBalance: true }
    await repo.saveTransaction(draft)
    const id = (await repo.load()).transactions[0].id
    await repo.saveTransaction({ ...draft, amount: 80 }, id)
    expect((await repo.load()).accounts[0].balance).toBe(420)
    await repo.deleteTransaction(id, true)
    const restored = await repo.load()
    expect(restored.accounts[0].balance).toBe(500)
    expect(restored.transactions).toEqual([])
    expect(restored.snapshots[0].totalAssets).toBe(500)
  })

  it('can delete a synced record without restoring its account balance', async () => {
    const repo = repository()
    await repo.load()
    const timestamp = new Date().toISOString()
    await repo.saveAccount({ id: 'wechat', name: '微信', category: 'virtual', balance: 500, note: '', icon: 'wechat', createdAt: timestamp, updatedAt: timestamp })
    await repo.saveTransaction({ type: 'expense', amount: 30, category: '饮食', subcategory: '', accountId: 'wechat', date: localDateKey(), note: '', syncBalance: true })
    const id = (await repo.load()).transactions[0].id
    await repo.deleteTransaction(id, false)
    const after = await repo.load()
    expect(after.accounts[0].balance).toBe(470)
    expect(after.transactions).toEqual([])
  })

  it('rolls back the record if a synced account update is invalid', async () => {
    const repo = repository()
    await repo.load()
    const timestamp = new Date().toISOString()
    await repo.saveAccount({ id: 'wechat', name: '微信', category: 'virtual', balance: 10, note: '', icon: 'wechat', createdAt: timestamp, updatedAt: timestamp })
    const before = await repo.load()
    await expect(repo.saveTransaction({ type: 'expense', amount: 20, category: '饮食', subcategory: '', accountId: 'wechat', date: localDateKey(), note: '', syncBalance: true })).rejects.toThrow('余额不足')
    const after = await repo.load()
    expect(after).toEqual(before)
  })
})
