import { isLiability, localDateKey, type Account } from './domain'

export type TransactionType = 'expense' | 'income'

export const expenseCategories = ['饮食', '购物', '服饰', '交通', '娱乐', '学习', '医疗', '居住', '数码', '旅行', '人情', '运动', '日用', '其他'] as const
export const incomeCategories = ['生活费', '工资', '奖金', '兼职', '报销', '退款', '红包', '投资收益', '其他'] as const

export interface TransactionDraft {
  type: TransactionType
  amount: number
  category: string
  subcategory: string
  accountId: string
  date: string
  note: string
  syncBalance: boolean
}

export interface Transaction extends TransactionDraft {
  id: string
  accountName: string
  balanceDelta: number
  accountDeleted?: boolean
  createdAt: string
  updatedAt: string
}

export function balanceDeltaFor(draft: Pick<TransactionDraft, 'type' | 'amount' | 'syncBalance'>, account: Pick<Account, 'category'>): number {
  if (draft.type === 'income' && isLiability(account.category)) throw new Error('收入账户只能选择资产账户')
  if (!draft.syncBalance) return 0
  const cents = Math.round(draft.amount * 100)
  return (draft.type === 'income' || isLiability(account.category) ? cents : -cents) / 100
}

export function validateTransactionDraft(draft: TransactionDraft): void {
  if (!Number.isFinite(draft.amount) || draft.amount <= 0 || !Number.isSafeInteger(Math.round(draft.amount * 100)) || Math.abs(draft.amount * 100 - Math.round(draft.amount * 100)) > .000001) throw new Error('金额必须大于 0，最多保留两位小数')
  if (draft.type !== 'expense' && draft.type !== 'income') throw new Error('流水类型不正确')
  if (!(draft.type === 'expense' ? expenseCategories : incomeCategories).some((category) => category === draft.category)) throw new Error('流水分类不正确')
  if (draft.subcategory.length > 80 || draft.note.length > 200) throw new Error('小类或备注过长')
  if (!draft.accountId) throw new Error('请选择账户')
  const date = new Date(`${draft.date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== draft.date) throw new Error('日期不正确')
}

export function monthSummary(transactions: Transaction[], month: string): { expense: number; income: number; balance: number } {
  let expense = 0
  let income = 0
  for (const transaction of transactions) {
    if (!transaction.date.startsWith(`${month}-`)) continue
    if (transaction.type === 'expense') expense += Math.round(transaction.amount * 100)
    else income += Math.round(transaction.amount * 100)
  }
  return { expense: expense / 100, income: income / 100, balance: (income - expense) / 100 }
}

export function previousMonthKey(now = new Date()): string {
  return localDateKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7)
}

export function availableMonthKeys(transactions: Transaction[], now = new Date()): string[] {
  const current = localDateKey(now).slice(0, 7)
  return [...new Set([current, previousMonthKey(now), ...transactions.map((transaction) => transaction.date.slice(0, 7))])].sort().reverse()
}

export function monthExpenseCategories(transactions: Transaction[], month: string): { category: string; amount: number }[] {
  const totals = new Map<string, number>()
  for (const transaction of transactions) {
    if (transaction.type !== 'expense' || !transaction.date.startsWith(`${month}-`)) continue
    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + Math.round(transaction.amount * 100))
  }
  return [...totals].map(([category, cents]) => ({ category, amount: cents / 100 })).sort((a, b) => b.amount - a.amount)
}
