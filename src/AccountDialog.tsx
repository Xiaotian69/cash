import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Pencil, Trash2, X } from 'lucide-react'
import { AccountIcon } from './AccountIcon'
import { CATEGORIES, formatMoney, isLiability, parseBalance, type Account, type Category } from './domain'

export interface AccountDraft {
  name: string
  category: Category
  balance: number
  note: string
  icon: string
}

const ICON_OPTIONS = [
  { value: 'auto', label: '自动匹配' },
  { value: 'bank', label: '银行卡' },
  { value: 'cash', label: '现金' },
  { value: 'credit', label: '信用账户' },
  { value: 'virtual', label: '虚拟账户' },
  { value: 'investment', label: '投资账户' },
  { value: 'liability', label: '负债' },
  { value: 'wechat', label: '微信' },
  { value: 'alipay', label: '支付宝' },
]

interface AccountDialogProps {
  account: Account | null
  linkedTransactions: number
  currencySymbol: string
  onClose: () => void
  onSave: (draft: AccountDraft, previous: Account | null) => Promise<boolean>
  onDelete: (account: Account) => Promise<boolean>
}

export function AccountDialog({ account, linkedTransactions, currencySymbol, onClose, onSave, onDelete }: AccountDialogProps) {
  const [view, setView] = useState<'detail' | 'edit'>(account ? 'detail' : 'edit')
  const [name, setName] = useState(account?.name ?? '')
  const [category, setCategory] = useState<Category>(account?.category ?? 'bank')
  const [balance, setBalance] = useState(account?.balance.toFixed(2) ?? '')
  const [note, setNote] = useState(account?.note ?? '')
  const [icon, setIcon] = useState(account?.icon ?? 'auto')
  const [validation, setValidation] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, submitting])

  function returnToDetail() {
    if (!account) return
    setName(account.name)
    setCategory(account.category)
    setBalance(account.balance.toFixed(2))
    setNote(account.note)
    setIcon(account.icon)
    setValidation('')
    setView('detail')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseBalance(balance)
    if (!name.trim()) { setValidation('请输入账户名称'); return }
    if (name.trim().length > 80) { setValidation('账户名称不能超过 80 个字'); return }
    if (parsed === null) { setValidation('余额请输入不小于 0 的金额，最多保留两位小数'); return }
    setValidation('')
    setSubmitting(true)
    try {
      const saved = await onSave({ name: name.trim(), category, balance: parsed, note: note.trim(), icon }, account)
      if (saved) onClose()
    } finally { setSubmitting(false) }
  }

  async function remove() {
    if (!account) return
    setSubmitting(true)
    try { if (await onDelete(account)) onClose() }
    finally { setSubmitting(false) }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
      <div className="account-dialog" role="dialog" aria-modal="true" aria-label={account ? account.name : '添加账户'}>
        <div className="dialog-header">
          <button className="icon-button" onClick={view === 'edit' && account ? returnToDetail : onClose} type="button" aria-label="返回" disabled={submitting}>
            <ArrowLeft size={20} />
          </button>
          <h2>{view === 'detail' ? '账户详情' : account ? '编辑账户' : '添加账户'}</h2>
          <button className="icon-button" onClick={onClose} type="button" aria-label="关闭" disabled={submitting}><X size={20} /></button>
        </div>

        {view === 'detail' && account ? (
          <div className="dialog-body">
            <div className="detail-account">
              <AccountIcon account={account} />
              <div><h3>{account.name}</h3><p>{CATEGORIES.find((item) => item.id === account.category)?.label}{account.note ? ` · ${account.note}` : ''}</p></div>
            </div>
            <div className="detail-balance-card">
              <span>当前余额{isLiability(account.category) ? '（欠款）' : ''}</span>
              <strong>{formatMoney(isLiability(account.category) ? -account.balance : account.balance, currencySymbol)}</strong>
            </div>
            <form onSubmit={submit} className="dialog-form">
              <label htmlFor="new-balance">修改当前余额</label>
              <div className="money-input"><span>{currencySymbol}</span><input id="new-balance" type="text" inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0.00" autoFocus /></div>
              <p className="field-hint">{isLiability(account.category) ? '输入正数表示当前欠款；页面会显示负号。' : '直接填写该账户现在的余额。'}保存后会更新今天的资产快照。</p>
              {validation && <p className="form-error" role="alert">{validation}</p>}
              <div className="balance-actions"><button className="button button-plain" type="button" onClick={onClose} disabled={submitting}>取消</button><button className="button button-yellow" type="submit" disabled={submitting}>保存余额</button></div>
            </form>
            <div className="dialog-secondary-actions">
              <button type="button" onClick={() => { setValidation(''); setView('edit') }}><Pencil size={17} /> 编辑账户资料</button>
              <button type="button" className="danger-text" onClick={() => setConfirmDelete(true)}><Trash2 size={17} /> 删除账户</button>
            </div>
            {confirmDelete && <div className="inline-confirm"><p>确定删除「{account.name}」？历史快照仍会保留过去的余额。{linkedTransactions > 0 && `关联的 ${linkedTransactions} 笔流水会保留并标记原账户已删除，之后无法恢复该账户的余额。`}</p><div><button className="button button-plain" onClick={() => setConfirmDelete(false)} disabled={submitting} type="button">取消</button><button className="button button-danger" onClick={remove} disabled={submitting} type="button">确认删除</button></div></div>}
          </div>
        ) : (
          <form onSubmit={submit} className="dialog-body dialog-form edit-form">
            <div className="field"><label htmlFor="account-category">账户类型</label><select id="account-category" value={category} onChange={(event) => setCategory(event.target.value as Category)}>{CATEGORIES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></div>
            <div className="field"><label htmlFor="account-name">账户名称</label><input id="account-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：建设银行" maxLength={80} autoFocus /></div>
            <div className="field"><label htmlFor="account-balance">{isLiability(category) ? '当前欠款' : '当前余额'}</label><div className="money-input"><span>{currencySymbol}</span><input id="account-balance" type="text" inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0.00" /></div>{isLiability(category) && <small className="field-hint">负债请填正数。</small>}</div>
            <div className="field"><label htmlFor="account-note">备注 <span>选填</span></label><input id="account-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：生活费银行卡" maxLength={200} /></div>
            <div className="field"><label htmlFor="account-icon">图标</label><select id="account-icon" value={ICON_OPTIONS.some((item) => item.value === icon) ? icon : 'auto'} onChange={(event) => setIcon(event.target.value)}>{ICON_OPTIONS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></div>
            {validation && <p className="form-error" role="alert">{validation}</p>}
            <button className="button button-yellow button-full" type="submit" disabled={submitting}>{account ? '保存修改' : '添加账户'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
