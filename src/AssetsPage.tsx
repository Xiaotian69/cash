import { ChevronRight, Plus } from 'lucide-react'
import { AccountIcon } from './AccountIcon'
import { CATEGORIES, calculateTotals, categoryTotals, formatMoney, formatNumber, isLiability, type Account } from './domain'

interface AssetsPageProps {
  accounts: Account[]
  currencySymbol: string
  lastUpdated: string
  onAdd: () => void
  onOpen: (account: Account) => void
}

export function AssetsPage({ accounts, currencySymbol, lastUpdated, onAdd, onOpen }: AssetsPageProps) {
  const totals = calculateTotals(accounts)
  const composition = categoryTotals(accounts, 'asset')
  const leaders = accounts.filter((account) => !isLiability(account.category)).sort((a, b) => b.balance - a.balance).slice(0, 3)

  return (
    <div className="page-content assets-page">
      <div className="page-heading">
        <div>
          <h1>我的资产</h1>
          <p className="heading-subtitle">最后更新：{lastUpdated}</p>
        </div>
        <button className="button button-dark add-button" onClick={onAdd} type="button">
          <Plus size={18} /> 添加账户
        </button>
      </div>

      <section className="summary-grid" aria-label="资产总览">
        <div className={`summary-metric summary-primary ${totals.netAssets < 0 ? 'summary-negative' : ''}`}><span>净资产</span><strong className="summary-amount">{totals.netAssets < 0 && '-'}<span className="summary-symbol">{currencySymbol}</span>{formatNumber(Math.abs(totals.netAssets))}</strong><small>总资产减去总负债</small></div>
        <div className="summary-metric"><span>总资产</span><strong>{formatMoney(totals.totalAssets, currencySymbol)}</strong><small>当前所有资产账户</small></div>
        <div className="summary-metric"><span>总负债</span><strong>{formatMoney(totals.totalLiabilities, currencySymbol)}</strong><small>当前待偿还金额</small></div>
      </section>

      <div className="assets-body">
      <section className="accounts-panel"><div className="section-title-row">
        <div>
          <h2>账户明细</h2>
        </div>
        <span className="account-count">共 {accounts.length} 个账户</span>
      </div>

      {accounts.length === 0 ? (
        <div className="empty-card">
          <WalletEmpty />
          <h3>还没有账户</h3>
          <p>添加第一个账户，开始记录当前资产。</p>
          <button className="button button-yellow" onClick={onAdd} type="button">+ 添加账户</button>
        </div>
      ) : (
        <div className="account-groups">
          {CATEGORIES.map((category) => {
            const group = accounts.filter((account) => account.category === category.id)
            if (group.length === 0) return null
            const cents = group.reduce((sum, account) => sum + Math.round(account.balance * 100), 0)
            const amount = (isLiability(category.id) ? -cents : cents) / 100
            return (
              <section className="account-group" key={category.id} aria-label={category.label}>
                <div className="group-heading"><h3>{category.label}</h3><span>{formatMoney(amount, currencySymbol)}</span></div>
                <div className="group-list">
                  {group.map((account) => (
                    <button className="account-row" key={account.id} onClick={() => onOpen(account)} type="button">
                      <AccountIcon account={account} />
                      <span className="account-row-main"><strong>{account.name}</strong>{account.note && <small>{account.note}</small>}</span>
                      <span className={`account-row-balance ${isLiability(account.category) ? 'negative' : ''}`}>
                        {formatMoney(isLiability(account.category) ? -account.balance : account.balance, currencySymbol)}
                      </span>
                      <ChevronRight className="account-chevron" size={16} />
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
      </section>
      <aside className="assets-insights" aria-label="资产概览">
        <section className="insight-card">
          <div className="insight-heading"><h2>资产构成</h2><span>按账户类型</span></div>
          {totals.totalAssets > 0 ? <>
            <div className="composition-bar" aria-label="资产构成比例">{composition.map((item) => <span key={item.category} style={{ width: `${item.amount / totals.totalAssets * 100}%`, background: CATEGORIES.find((category) => category.id === item.category)?.color }} />)}</div>
            <div className="composition-list">{composition.map((item) => {
              const meta = CATEGORIES.find((category) => category.id === item.category)!
              return <div className="composition-row" key={item.category}><span className="legend-dot" style={{ background: meta.color }} /><span>{meta.label}</span><strong>{formatMoney(item.amount, currencySymbol)}</strong><small>{(item.amount / totals.totalAssets * 100).toFixed(1)}%</small></div>
            })}</div>
          </> : <p className="insight-empty">添加账户后，这里会显示资产分布。</p>}
        </section>
        <section className="insight-card">
          <div className="insight-heading"><h2>余额最高的账户</h2><span>前 3 名</span></div>
          {leaders.length > 0 ? leaders.map((account, index) => <div className="leader-row" key={account.id}><span>{String(index + 1).padStart(2, '0')}</span><strong>{account.name}</strong><b>{formatMoney(account.balance, currencySymbol)}</b></div>) : <p className="insight-empty">暂无资产账户</p>}
        </section>
      </aside>
      </div>
    </div>
  )
}

function WalletEmpty() {
  return <div className="empty-icon"><Plus size={28} /></div>
}
