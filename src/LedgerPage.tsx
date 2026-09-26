import { useState } from 'react'
import { BookOpen, BusFront, Clapperboard, Dumbbell, Ellipsis, Gift, HandCoins, HeartPulse, House, Package, Plane, Plus, Receipt, Shirt, ShoppingBag, Smartphone, UtensilsCrossed } from 'lucide-react'
import { formatMoney, localDateKey, type Account } from './domain'
import { availableMonthKeys, monthExpenseCategories, monthSummary, previousMonthKey, type Transaction, type TransactionType } from './ledger'

interface LedgerPageProps {
  accounts: Account[]
  transactions: Transaction[]
  currencySymbol: string
  onAdd: (type: TransactionType) => void
  onOpen: (transaction: Transaction) => void
}

const icons = {
  '饮食': UtensilsCrossed, '购物': ShoppingBag, '服饰': Shirt, '交通': BusFront,
  '娱乐': Clapperboard, '学习': BookOpen, '医疗': HeartPulse, '居住': House,
  '数码': Smartphone, '旅行': Plane, '人情': Gift, '运动': Dumbbell,
  '日用': Package, '其他': Ellipsis,
} as const
const colors = ['#f0bd54', '#8985f4', '#50b9d8', '#54bea2', '#f08492', '#b39be8', '#a9bd66', '#e7a36c', '#6bafdc', '#d490b2', '#78b9ae', '#d4b56b', '#9ca5d1', '#a7abae']

function dayLabel(date: string): string {
  const today = localDateKey()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (date === today) return '今天'
  if (date === localDateKey(yesterday)) return '昨天'
  const [, month, day] = date.split('-')
  return `${Number(month)}月${Number(day)}日`
}

export function LedgerPage({ accounts, transactions, currencySymbol, onAdd, onOpen }: LedgerPageProps) {
  const [filter, setFilter] = useState<'all' | TransactionType>('all')
  const [month, setMonth] = useState(localDateKey().slice(0, 7))
  const currentMonth = localDateKey().slice(0, 7)
  const previousMonth = previousMonthKey()
  const months = [...new Set([...availableMonthKeys(transactions), month])].sort().reverse()
  const monthLabel = month === currentMonth ? '本月' : month === previousMonth ? '上月' : `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`
  const totals = monthSummary(transactions, month)
  const composition = monthExpenseCategories(transactions, month)
  const visible = transactions.filter((transaction) => transaction.date.startsWith(`${month}-`) && (filter === 'all' || transaction.type === filter))
  const groups = [...new Set(visible.map((transaction) => transaction.date))]
  const circumference = 2 * Math.PI * 52

  return <div className="page-content ledger-page">
    <div className="page-heading"><div><h1>记账</h1><p className="heading-subtitle">简单记录每一笔收入与支出</p></div><div className="ledger-actions"><button className="button button-yellow" type="button" onClick={() => onAdd('expense')}><Plus size={16} />记支出</button><button className="button button-plain" type="button" onClick={() => onAdd('income')}><Plus size={16} />记收入</button></div></div>

    <div className="ledger-summary" aria-label={`${monthLabel}收支概览`}>
      <div><span>{monthLabel}支出</span><strong>{formatMoney(totals.expense, currencySymbol)}</strong><small>仅统计已记录流水</small></div>
      <div><span>{monthLabel}收入</span><strong>{formatMoney(totals.income, currencySymbol)}</strong><small>仅统计已记录流水</small></div>
      <div><span>{monthLabel}结余</span><strong className={totals.balance < 0 ? 'negative' : ''}>{formatMoney(totals.balance, currencySymbol)}</strong><small>收入减去支出</small></div>
    </div>

    <div className="ledger-body">
      <section className="ledger-list-panel">
        <div className="ledger-toolbar"><h2>最近流水</h2><div className="ledger-filters"><div className="filter-tabs" role="tablist" aria-label="流水类型">{([{ id: 'all', label: '全部' }, { id: 'expense', label: '支出' }, { id: 'income', label: '收入' }] as const).map((option) => <button type="button" role="tab" aria-selected={filter === option.id} className={filter === option.id ? 'active' : ''} key={option.id} onClick={() => setFilter(option.id)}>{option.label}</button>)}</div><select aria-label="流水月份" value={month} onChange={(event) => setMonth(event.target.value)}>{months.map((option) => <option value={option} key={option}>{option === currentMonth ? '本月' : option === previousMonth ? '上月' : `${Number(option.slice(0, 4))}年${Number(option.slice(5, 7))}月`}</option>)}</select></div></div>
        {visible.length === 0 ? <div className="ledger-empty"><Receipt size={29} /><h3>{transactions.length === 0 ? '还没有记账记录' : '这个月份暂无记录'}</h3><p>{transactions.length === 0 ? '记录第一笔收入或支出吧' : '切换月份或记录一笔新流水'}</p><div><button className="button button-yellow" type="button" onClick={() => onAdd('expense')}>记支出</button><button className="button button-plain" type="button" onClick={() => onAdd('income')}>记收入</button></div></div> : <div className="ledger-list">{groups.map((date) => <div className="ledger-day" key={date}><div className="ledger-day-heading">{dayLabel(date)}<span>{date}</span></div>{visible.filter((transaction) => transaction.date === date).map((transaction) => {
          const Icon = transaction.type === 'income' ? HandCoins : icons[transaction.category as keyof typeof icons] ?? Receipt
          const account = accounts.find((item) => item.id === transaction.accountId)
          return <button className="ledger-row" type="button" onClick={() => onOpen(transaction)} key={transaction.id}><span className={`ledger-icon ${transaction.type}`}><Icon size={19} /></span><span className="ledger-row-main"><strong>{transaction.category}{transaction.subcategory && <em> · {transaction.subcategory}</em>}</strong><small>{account?.name ?? transaction.accountName}{transaction.note && ` · ${transaction.note}`}</small></span><strong className={`ledger-amount ${transaction.type}`}>{transaction.type === 'expense' ? '-' : '+'}{formatMoney(transaction.amount, currencySymbol)}</strong></button>
        })}</div>)}</div>}
      </section>

      <aside className="ledger-composition"><div className="insight-heading"><h2>{monthLabel}支出构成</h2><span>{monthLabel}</span></div>{totals.expense === 0 ? <p className="insight-empty">这个月份还没有支出记录。</p> : <><div className="ledger-donut"><svg viewBox="0 0 160 160" role="img" aria-label={`${monthLabel}支出分类占比`}><circle cx="80" cy="80" r="52" fill="none" stroke="#f0f1ef" strokeWidth="18" />{composition.map((item, index) => {
        const length = item.amount / totals.expense * circumference
        const currentOffset = composition.slice(0, index).reduce((sum, previous) => sum + previous.amount / totals.expense * circumference, 0)
        return <circle key={item.category} cx="80" cy="80" r="52" fill="none" stroke={colors[index % colors.length]} strokeWidth="18" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-currentOffset} transform="rotate(-90 80 80)" />
      })}</svg><div><small>{monthLabel}支出</small><strong>{formatMoney(totals.expense, currencySymbol)}</strong></div></div><div className="ledger-composition-list">{composition.map((item, index) => <div key={item.category}><i style={{ background: colors[index % colors.length] }} /><span>{item.category}</span><strong>{formatMoney(item.amount, currencySymbol)}</strong><small>{(item.amount / totals.expense * 100).toFixed(0)}%</small></div>)}</div></>}
      </aside>
    </div>
  </div>
}
