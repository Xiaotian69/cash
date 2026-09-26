import { useEffect, useState, type FormEvent } from 'react'
import { Pencil, Trash2, X } from 'lucide-react'
import { formatMoney, isLiability, localDateKey, parseBalance, type Account } from './domain'
import { expenseCategories, incomeCategories, type Transaction, type TransactionDraft, type TransactionType } from './ledger'

interface TransactionDialogProps {
  transaction: Transaction | null
  type: TransactionType
  accounts: Account[]
  currencySymbol: string
  onClose: () => void
  onSave: (draft: TransactionDraft, id?: string) => Promise<boolean>
  onDelete: (id: string, restoreBalance: boolean) => Promise<boolean>
}

export function TransactionDialog({ transaction, type, accounts, currencySymbol, onClose, onSave, onDelete }: TransactionDialogProps) {
  const kind = transaction?.type ?? type
  const options = kind === 'expense' ? accounts : accounts.filter((account) => !isLiability(account.category))
  const [view, setView] = useState<'detail' | 'edit'>(transaction ? 'detail' : 'edit')
  const [amount, setAmount] = useState(transaction?.amount.toFixed(2) ?? '')
  const [category, setCategory] = useState(transaction?.category ?? (kind === 'expense' ? expenseCategories[0] : incomeCategories[0]))
  const [subcategory, setSubcategory] = useState(transaction?.subcategory ?? '')
  const [accountId, setAccountId] = useState(transaction?.accountDeleted ? '' : transaction?.accountId ?? options[0]?.id ?? '')
  const [syncBalance, setSyncBalance] = useState(transaction?.syncBalance ?? true)
  const [date, setDate] = useState(transaction?.date ?? localDateKey())
  const [note, setNote] = useState(transaction?.note ?? '')
  const [validation, setValidation] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [restoreBalance, setRestoreBalance] = useState(transaction ? transaction.balanceDelta !== 0 && !transaction.accountDeleted : false)
  const [busy, setBusy] = useState(false)
  const selectedAccount = accounts.find((account) => account.id === accountId)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, busy])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseBalance(amount)
    if (parsed === null || parsed <= 0) { setValidation('请输入大于 0 的金额，最多保留两位小数'); return }
    if (!accountId) { setValidation('请先在资产页添加账户'); return }
    if (!selectedAccount) { setValidation('所选账户已不存在，请重新选择'); return }
    if (!date) { setValidation('请选择日期'); return }
    setValidation('')
    setBusy(true)
    try {
      if (await onSave({ type: kind, amount: parsed, category, subcategory: subcategory.trim(), accountId, date, note: note.trim(), syncBalance }, transaction?.id)) onClose()
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!transaction) return
    setBusy(true)
    try { if (await onDelete(transaction.id, restoreBalance)) onClose() }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div className="transaction-dialog" role="dialog" aria-modal="true" aria-label={transaction ? '流水详情' : kind === 'expense' ? '记支出' : '记收入'}>
      <div className="dialog-header"><span className="dialog-header-spacer" /><h2>{view === 'detail' ? '流水详情' : transaction ? '编辑流水' : kind === 'expense' ? '记支出' : '记收入'}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="关闭" disabled={busy}><X size={19} /></button></div>
      {view === 'detail' && transaction ? <div className="transaction-detail">
        <span className="transaction-detail-kind">{kind === 'expense' ? '支出' : '收入'} · {transaction.category}</span>
        <strong className={`transaction-detail-amount ${kind}`}>{kind === 'expense' ? '-' : '+'}{formatMoney(transaction.amount, currencySymbol)}</strong>
        <dl><div><dt>{kind === 'expense' ? '小类' : '来源/说明'}</dt><dd>{transaction.subcategory || '—'}</dd></div><div><dt>{kind === 'expense' ? '支付账户' : '收入账户'}</dt><dd>{selectedAccount?.name ?? transaction.accountName}{transaction.accountDeleted ? '（已删除）' : ''}</dd></div><div><dt>日期</dt><dd>{transaction.date}</dd></div><div><dt>余额联动</dt><dd>{transaction.accountDeleted ? transaction.balanceDelta !== 0 ? '曾同步，原账户已删除' : '未同步，原账户已删除' : transaction.balanceDelta !== 0 ? '已同步' : '未同步'}</dd></div><div><dt>备注</dt><dd>{transaction.note || '—'}</dd></div></dl>
        <div className="transaction-detail-actions"><button className="button button-yellow" type="button" onClick={() => setView('edit')}><Pencil size={15} />编辑</button><button className="button button-plain" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={15} />删除</button></div>
        {confirmDelete && <div className="inline-confirm"><p>确定删除这笔{kind === 'expense' ? '支出' : '收入'}记录？{transaction.accountDeleted && '原账户已删除，无法恢复其余额。'}</p>{transaction.balanceDelta !== 0 && !transaction.accountDeleted && <label className="restore-check"><input type="checkbox" checked={restoreBalance} onChange={(event) => setRestoreBalance(event.target.checked)} />同时恢复账户余额</label>}<div><button className="button button-plain" type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>取消</button><button className="button button-danger" type="button" disabled={busy} onClick={remove}>确认删除</button></div></div>}
      </div> : <form className="transaction-form" onSubmit={submit}>
        <div className="field"><label htmlFor="transaction-amount">金额</label><div className="money-input transaction-money"><span>{currencySymbol}</span><input id="transaction-amount" type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" autoFocus /></div></div>
        <div className="transaction-field-grid"><div className="field"><label htmlFor="transaction-category">{kind === 'expense' ? '大类' : '收入类型'}</label><select id="transaction-category" value={category} onChange={(event) => setCategory(event.target.value)}>{(kind === 'expense' ? expenseCategories : incomeCategories).map((item) => <option key={item} value={item}>{item}</option>)}</select></div><div className="field"><label htmlFor="transaction-subcategory">{kind === 'expense' ? '小类' : '来源/说明'} <span>选填</span></label><input id="transaction-subcategory" value={subcategory} onChange={(event) => setSubcategory(event.target.value)} maxLength={80} placeholder={kind === 'expense' ? '例如：麦当劳' : '例如：工资收入'} /></div></div>
        <div className="field"><label htmlFor="transaction-account">{kind === 'expense' ? '支付账户' : '收入账户'}</label><select id="transaction-account" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">{transaction?.accountDeleted ? '原账户已删除，请重新选择' : '请选择账户'}</option>{options.map((account) => <option key={account.id} value={account.id}>{account.name} · {isLiability(account.category) ? `欠款 ${formatMoney(account.balance, currencySymbol)}` : formatMoney(account.balance, currencySymbol)}</option>)}</select></div>
        <label className="sync-toggle"><input type="checkbox" checked={syncBalance} onChange={(event) => setSyncBalance(event.target.checked)} /><span><strong>同步修改账户余额</strong><small>{kind === 'expense' ? '开启后，本笔支出会同步修改所选账户余额。' : '开启后，本笔收入会自动增加所选账户余额。'}</small></span></label>
        <div className="field"><label htmlFor="transaction-date">日期</label><input id="transaction-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
        <div className="field"><label htmlFor="transaction-note">备注 <span>选填</span></label><input id="transaction-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder="补充说明" /></div>
        {validation && <p className="form-error" role="alert">{validation}</p>}
        <div className="transaction-form-actions"><button className="button button-plain" type="button" disabled={busy} onClick={transaction ? () => setView('detail') : onClose}>取消</button><button className="button button-yellow" type="submit" disabled={busy}>{transaction ? '保存修改' : kind === 'expense' ? '保存支出' : '保存收入'}</button></div>
      </form>}
    </div>
  </div>
}
