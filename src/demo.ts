// Fictional demonstration data only; never use personal account data here.
import { createSnapshot, localDateKey, type Account, type Category } from './domain'

const entries: { id: string; name: string; category: Category; balance: number; icon: string }[] = [
  { id: 'demo-icbc', name: '工商银行', category: 'bank', balance: 1250.2, icon: 'icbc' },
  { id: 'demo-ccb', name: '建设银行', category: 'bank', balance: 12000.25, icon: 'ccb' },
  { id: 'demo-cmb', name: '招商银行', category: 'bank', balance: 1549.4, icon: 'cmb' },
  { id: 'demo-huabei', name: '蚂蚁花呗', category: 'credit', balance: 800.15, icon: 'huabei' },
  { id: 'demo-wechat', name: '微信', category: 'virtual', balance: 600.45, icon: 'wechat' },
  { id: 'demo-fund', name: '基金', category: 'investment', balance: 3500.35, icon: 'fund' },
  { id: 'demo-installment', name: '分期余额', category: 'liability', balance: 2400, icon: 'debt' },
]

export function createDemoData() {
  const startedAt = Date.now()
  const accounts: Account[] = entries.map((entry, index) => ({
    ...entry,
    note: '',
    createdAt: new Date(startedAt + index).toISOString(),
    updatedAt: new Date(startedAt + index).toISOString(),
  }))
  return { accounts, snapshot: createSnapshot(accounts, localDateKey()) }
}
