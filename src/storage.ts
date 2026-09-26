import { createSnapshot, localDateKey, type Account, type Settings, type Snapshot } from './domain'
import { balanceDeltaFor, validateTransactionDraft, type Transaction, type TransactionDraft } from './ledger'

export interface AppData {
  accounts: Account[]
  snapshots: Snapshot[]
  transactions: Transaction[]
  settings: Settings
}

type SettingRow = { key: string; value: string }
type MetaRow = { key: string; value: boolean }

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('本地数据写入已中止'))
    transaction.onerror = () => reject(transaction.error ?? new Error('本地数据写入失败'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('本地数据读取失败'))
  })
}

export function createRepository(databaseName = 'personal-asset-manager') {
  let databasePromise: Promise<IDBDatabase> | null = null

  function open(): Promise<IDBDatabase> {
    if (databasePromise) return databasePromise
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 2)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains('accounts')) database.createObjectStore('accounts', { keyPath: 'id' })
        if (!database.objectStoreNames.contains('snapshots')) database.createObjectStore('snapshots', { keyPath: 'date' })
        if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'key' })
        if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'key' })
        if (!database.objectStoreNames.contains('transactions')) database.createObjectStore('transactions', { keyPath: 'id' })
      }
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => {
          database.close()
          databasePromise = null
        }
        resolve(database)
      }
      request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'))
      request.onblocked = () => reject(new Error('本地数据库被另一个窗口占用，请关闭其他窗口后重试'))
    }).catch((error: unknown) => {
      databasePromise = null
      throw error
    })
    databasePromise = opening
    return opening
  }

  async function initialize(database: IDBDatabase): Promise<void> {
    const transaction = database.transaction(['accounts', 'snapshots', 'settings', 'meta'], 'readwrite')
    const done = transactionDone(transaction)
    const marker = transaction.objectStore('meta').get('initialized')
    marker.onsuccess = () => {
      if (marker.result) return
      transaction.objectStore('settings').put({ key: 'currencySymbol', value: '¥' } satisfies SettingRow)
      transaction.objectStore('meta').put({ key: 'initialized', value: true } satisfies MetaRow)
    }
    await done
  }

  async function load(): Promise<AppData> {
    const database = await open()
    await initialize(database)
    const transaction = database.transaction(['accounts', 'snapshots', 'transactions', 'settings'], 'readonly')
    const done = transactionDone(transaction)
    const accountsPromise = requestResult<Account[]>(transaction.objectStore('accounts').getAll())
    const snapshotsPromise = requestResult<Snapshot[]>(transaction.objectStore('snapshots').getAll())
    const transactionsPromise = requestResult<Transaction[]>(transaction.objectStore('transactions').getAll())
    const settingPromise = requestResult<SettingRow | undefined>(transaction.objectStore('settings').get('currencySymbol'))
    const [accounts, snapshots, transactions, setting] = await Promise.all([accountsPromise, snapshotsPromise, transactionsPromise, settingPromise])
    await done
    return {
      accounts: accounts.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, 'zh-CN')),
      snapshots: snapshots.sort((a, b) => a.date.localeCompare(b.date)),
      transactions: transactions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
      settings: { currencySymbol: setting?.value ?? '¥' },
    }
  }

  async function mutateAccount(mutation: (store: IDBObjectStore) => void): Promise<void> {
    const database = await open()
    const transaction = database.transaction(['accounts', 'snapshots'], 'readwrite')
    const done = transactionDone(transaction)
    const accountStore = transaction.objectStore('accounts')
    mutation(accountStore)
    const allAccounts = accountStore.getAll()
    allAccounts.onsuccess = () => {
      transaction.objectStore('snapshots').put(createSnapshot(allAccounts.result as Account[], localDateKey()))
    }
    await done
  }

  async function saveAccount(account: Account): Promise<void> {
    await mutateAccount((store) => { store.put(account) })
  }

  async function deleteAccount(id: string): Promise<void> {
    const database = await open()
    const transaction = database.transaction(['accounts', 'snapshots', 'transactions'], 'readwrite')
    const done = transactionDone(transaction)
    const accountStore = transaction.objectStore('accounts')
    const transactionStore = transaction.objectStore('transactions')
    let failure: Error | null = null
    try {
      const [accounts, entries] = await Promise.all([
        requestResult<Account[]>(accountStore.getAll()),
        requestResult<Transaction[]>(transactionStore.getAll()),
      ])
      if (!accounts.some((account) => account.id === id)) throw new Error('该账户已不存在，请刷新后重试')
      const timestamp = new Date().toISOString()
      for (const entry of entries) {
        if (entry.accountId === id) transactionStore.put({ ...entry, accountDeleted: true, updatedAt: timestamp } satisfies Transaction)
      }
      accountStore.delete(id)
      transaction.objectStore('snapshots').put(createSnapshot(accounts.filter((account) => account.id !== id), localDateKey()))
    } catch (reason) {
      failure = reason instanceof Error ? reason : new Error('删除账户失败')
      try { transaction.abort() } catch { /* already aborted */ }
    }
    try { await done } catch (reason) { throw failure ?? reason }
  }

  async function saveTransaction(draft: TransactionDraft, id?: string): Promise<void> {
    validateTransactionDraft(draft)
    const database = await open()
    const transaction = database.transaction(['accounts', 'snapshots', 'transactions'], 'readwrite')
    const done = transactionDone(transaction)
    const accountStore = transaction.objectStore('accounts')
    const transactionStore = transaction.objectStore('transactions')
    let failure: Error | null = null
    try {
      const [accounts, previous] = await Promise.all([
        requestResult<Account[]>(accountStore.getAll()),
        id ? requestResult<Transaction | undefined>(transactionStore.get(id)) : Promise.resolve(undefined),
      ])
      if (id && !previous) throw new Error('这条流水已不存在，请刷新后重试')
      const chosen = accounts.find((account) => account.id === draft.accountId)
      if (!chosen) throw new Error('所选账户已不存在')
      const balanceDelta = balanceDeltaFor(draft, chosen)
      const changes = new Map<string, number>()
      if (previous?.balanceDelta && !previous.accountDeleted) changes.set(previous.accountId, -Math.round(previous.balanceDelta * 100))
      if (balanceDelta) changes.set(draft.accountId, (changes.get(draft.accountId) ?? 0) + Math.round(balanceDelta * 100))
      const timestamp = new Date().toISOString()
      for (const [accountId, cents] of changes) {
        if (cents === 0) continue
        const index = accounts.findIndex((account) => account.id === accountId)
        if (index < 0) throw new Error('原关联账户已不存在，无法撤销旧余额变动')
        const nextCents = Math.round(accounts[index].balance * 100) + cents
        if (nextCents < 0) throw new Error('账户余额不足，无法同步这笔流水')
        if (!Number.isSafeInteger(nextCents)) throw new Error('账户余额超出允许范围')
        accounts[index] = { ...accounts[index], balance: nextCents / 100, updatedAt: timestamp }
        accountStore.put(accounts[index])
      }
      transactionStore.put({ ...draft, id: previous?.id ?? id ?? crypto.randomUUID(), accountName: chosen.name, balanceDelta, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp } satisfies Transaction)
      if ([...changes.values()].some((cents) => cents !== 0)) transaction.objectStore('snapshots').put(createSnapshot(accounts, localDateKey()))
    } catch (reason) {
      failure = reason instanceof Error ? reason : new Error('保存流水失败')
      try { transaction.abort() } catch { /* already aborted */ }
    }
    try { await done } catch (reason) { throw failure ?? reason }
  }

  async function deleteTransaction(id: string, restoreBalance: boolean): Promise<void> {
    const database = await open()
    const transaction = database.transaction(['accounts', 'snapshots', 'transactions'], 'readwrite')
    const done = transactionDone(transaction)
    const accountStore = transaction.objectStore('accounts')
    const transactionStore = transaction.objectStore('transactions')
    let failure: Error | null = null
    try {
      const [accounts, previous] = await Promise.all([
        requestResult<Account[]>(accountStore.getAll()),
        requestResult<Transaction | undefined>(transactionStore.get(id)),
      ])
      if (!previous) throw new Error('这条流水已不存在，请刷新后重试')
      if (restoreBalance && previous.accountDeleted) throw new Error('原账户已删除，无法恢复余额')
      if (restoreBalance && previous.balanceDelta) {
        const index = accounts.findIndex((account) => account.id === previous.accountId)
        if (index < 0) throw new Error('关联账户已不存在，请选择只删除流水')
        const nextCents = Math.round(accounts[index].balance * 100) - Math.round(previous.balanceDelta * 100)
        if (nextCents < 0) throw new Error('账户余额不足，无法恢复原余额')
        accounts[index] = { ...accounts[index], balance: nextCents / 100, updatedAt: new Date().toISOString() }
        accountStore.put(accounts[index])
        transaction.objectStore('snapshots').put(createSnapshot(accounts, localDateKey()))
      }
      transactionStore.delete(id)
    } catch (reason) {
      failure = reason instanceof Error ? reason : new Error('删除流水失败')
      try { transaction.abort() } catch { /* already aborted */ }
    }
    try { await done } catch (reason) { throw failure ?? reason }
  }

  async function updateCurrency(currencySymbol: string): Promise<void> {
    const database = await open()
    const transaction = database.transaction('settings', 'readwrite')
    const done = transactionDone(transaction)
    transaction.objectStore('settings').put({ key: 'currencySymbol', value: currencySymbol } satisfies SettingRow)
    await done
  }

  async function replaceData(data: AppData): Promise<void> {
    const database = await open()
    const transaction = database.transaction(['accounts', 'snapshots', 'transactions', 'settings', 'meta'], 'readwrite')
    const done = transactionDone(transaction)
    const accounts = transaction.objectStore('accounts')
    const snapshots = transaction.objectStore('snapshots')
    const transactions = transaction.objectStore('transactions')
    accounts.clear()
    snapshots.clear()
    transactions.clear()
    transaction.objectStore('settings').clear()
    for (const account of data.accounts) accounts.put(account)
    for (const snapshot of data.snapshots) snapshots.put(snapshot)
    for (const entry of data.transactions) transactions.put(entry)
    transaction.objectStore('settings').put({ key: 'currencySymbol', value: data.settings.currencySymbol } satisfies SettingRow)
    transaction.objectStore('meta').put({ key: 'initialized', value: true } satisfies MetaRow)
    await done
  }

  async function clear(): Promise<void> {
    await replaceData({ accounts: [], snapshots: [], transactions: [], settings: { currencySymbol: '¥' } })
  }

  return { load, saveAccount, deleteAccount, saveTransaction, deleteTransaction, updateCurrency, replaceData, clear }
}

export const financeRepository = createRepository()
