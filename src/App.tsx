import { useEffect, useState } from 'react'
import { ChartNoAxesCombined, Coins, Receipt, Settings2, X } from 'lucide-react'
import { AccountDialog, type AccountDraft } from './AccountDialog'
import { AssetsPage } from './AssetsPage'
import { ChartsPage } from './ChartsPage'
import { SettingsPage } from './SettingsPage'
import { LedgerPage } from './LedgerPage'
import { TransactionDialog } from './TransactionDialog'
import { financeRepository, type AppData } from './storage'
import type { Account } from './domain'
import { formatLastUpdated } from './domain'
import type { Transaction, TransactionDraft, TransactionType } from './ledger'
import './App.css'

type Page = 'assets' | 'ledger' | 'charts' | 'settings'

function App() {
  const [page, setPage] = useState<Page>('assets')
  const [data, setData] = useState<AppData | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<Account | null | undefined>(undefined)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null | undefined>(undefined)
  const [newTransactionType, setNewTransactionType] = useState<TransactionType>('expense')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    financeRepository.load().then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '本地数据读取失败'))
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 1800)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'n' && data && selectedAccount === undefined && selectedTransaction === undefined) {
        event.preventDefault()
        setSelectedAccount(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [data, selectedAccount, selectedTransaction])

  async function runAction(action: () => Promise<void>): Promise<boolean> {
    try {
      setError('')
      await action()
      setData(await financeRepository.load())
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败，请重试')
      return false
    }
  }

  async function saveAccount(draft: AccountDraft, previous: Account | null): Promise<boolean> {
    const timestamp = new Date().toISOString()
    const saved = await runAction(() => financeRepository.saveAccount({
      ...draft,
      id: previous?.id ?? crypto.randomUUID(),
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }))
    if (saved) setNotice(previous ? previous.balance !== draft.balance ? '余额已更新' : '账户已保存' : '账户已添加')
    return saved
  }

  async function deleteAccount(account: Account): Promise<boolean> {
    const deleted = await runAction(() => financeRepository.deleteAccount(account.id))
    if (deleted) setNotice('账户已删除')
    return deleted
  }

  async function saveTransaction(draft: TransactionDraft, id?: string): Promise<boolean> {
    const saved = await runAction(() => financeRepository.saveTransaction(draft, id))
    if (saved) setNotice(id ? '流水已更新' : draft.type === 'expense' ? '支出已记录' : '收入已记录')
    return saved
  }

  async function deleteTransaction(id: string, restoreBalance: boolean): Promise<boolean> {
    const deleted = await runAction(() => financeRepository.deleteTransaction(id, restoreBalance))
    if (deleted) setNotice('流水已删除')
    return deleted
  }

  const lastUpdated = formatLastUpdated([...(data?.accounts ?? []), ...(data?.transactions ?? [])])

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand"><span className="brand-mark">¥</span><span>个人资产管家</span></div>
        <div className="sidebar-caption">清楚掌握每一笔余额</div>
        <nav className="sidebar-nav" aria-label="主导航">
          <button className={page === 'assets' ? 'active' : ''} onClick={() => setPage('assets')} type="button" aria-current={page === 'assets' ? 'page' : undefined}><Coins size={19} /><span>资产</span></button>
          <button className={page === 'ledger' ? 'active' : ''} onClick={() => setPage('ledger')} type="button" aria-current={page === 'ledger' ? 'page' : undefined}><Receipt size={19} /><span>记账</span></button>
          <button className={page === 'charts' ? 'active' : ''} onClick={() => setPage('charts')} type="button" aria-current={page === 'charts' ? 'page' : undefined}><ChartNoAxesCombined size={19} /><span>图表</span></button>
          <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')} type="button" aria-current={page === 'settings' ? 'page' : undefined}><Settings2 size={19} /><span>设置</span></button>
        </nav>
        <div className="sidebar-footer"><span className="local-badge"><span className="status-dot" /> 仅存于本机</span><small>数据最后更新</small><strong>{lastUpdated}</strong></div>
      </aside>

      <main className="main-container">
        {!data ? (
          <div className="loading-state"><div className="loading-mark">¥</div><p>{error || '正在读取本地数据…'}</p>{error && <button className="button button-yellow" onClick={() => window.location.reload()}>重试</button>}</div>
        ) : page === 'assets' ? (
          <AssetsPage accounts={data.accounts} currencySymbol={data.settings.currencySymbol} lastUpdated={lastUpdated} onAdd={() => setSelectedAccount(null)} onOpen={setSelectedAccount} />
        ) : page === 'ledger' ? (
          <LedgerPage accounts={data.accounts} transactions={data.transactions} currencySymbol={data.settings.currencySymbol} onAdd={(type) => { setNewTransactionType(type); setSelectedTransaction(null) }} onOpen={setSelectedTransaction} />
        ) : page === 'charts' ? (
          <ChartsPage accounts={data.accounts} snapshots={data.snapshots} currencySymbol={data.settings.currencySymbol} />
        ) : (
          <SettingsPage data={data} onImport={(restored) => runAction(() => financeRepository.replaceData(restored))} onClear={() => runAction(() => financeRepository.clear())} onCurrency={(symbol) => runAction(() => financeRepository.updateCurrency(symbol))} />
        )}
      </main>

      {data && selectedAccount !== undefined && <AccountDialog
        key={selectedAccount?.id ?? 'new'}
        account={selectedAccount}
        linkedTransactions={selectedAccount ? data.transactions.filter((transaction) => transaction.accountId === selectedAccount.id).length : 0}
        currencySymbol={data.settings.currencySymbol}
        onClose={() => setSelectedAccount(undefined)}
        onSave={saveAccount}
        onDelete={deleteAccount}
      />}

      {data && selectedTransaction !== undefined && <TransactionDialog
        key={selectedTransaction?.id ?? `new-${newTransactionType}`}
        transaction={selectedTransaction}
        type={newTransactionType}
        accounts={data.accounts}
        currencySymbol={data.settings.currencySymbol}
        onClose={() => setSelectedTransaction(undefined)}
        onSave={saveTransaction}
        onDelete={deleteTransaction}
      />}

      {error && data && <div className="error-toast" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="关闭提示"><X size={16} /></button></div>}
      {notice && <div className="success-toast" role="status">{notice}</div>}
    </div>
  )
}

export default App
