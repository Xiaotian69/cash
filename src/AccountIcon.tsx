import {
  ChartNoAxesCombined,
  CreditCard,
  GraduationCap,
  Landmark,
  Layers3,
  MessageCircleMore,
  Smartphone,
  Wallet,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { Account, Category } from './domain'

function resolvedIcon(account: Pick<Account, 'icon' | 'name' | 'category'>): string {
  if (account.icon && account.icon !== 'auto') return account.icon
  if (account.name.includes('工商')) return 'icbc'
  if (account.name.includes('建设')) return 'ccb'
  if (account.name.includes('招商')) return 'cmb'
  if (account.name.includes('微信')) return 'wechat'
  if (account.name.includes('支付宝')) return 'alipay'
  if (account.name.includes('花呗')) return 'huabei'
  if (account.name.includes('学费')) return 'tuition'
  return account.category
}

const iconContent: Record<string, ReactNode> = {
  icbc: '工',
  ccb: '建',
  cmb: '招',
  huabei: '花',
  wechat: <MessageCircleMore size={22} strokeWidth={2.5} />,
  alipay: '支',
  tuition: <GraduationCap size={23} strokeWidth={2.2} />,
  debt: <GraduationCap size={23} strokeWidth={2.2} />,
  cash: <Wallet size={23} strokeWidth={2.2} />,
  bank: <Landmark size={22} strokeWidth={2.2} />,
  credit: <CreditCard size={23} strokeWidth={2.2} />,
  virtual: <Smartphone size={22} strokeWidth={2.2} />,
  investment: <ChartNoAxesCombined size={23} strokeWidth={2.2} />,
  fund: <ChartNoAxesCombined size={23} strokeWidth={2.2} />,
  liability: <CreditCard size={23} strokeWidth={2.2} />,
  custom: <Layers3 size={22} strokeWidth={2.2} />,
}

export function CategoryIcon({ category }: { category: Category }) {
  return <AccountIcon account={{ icon: category, name: '', category }} />
}

export function AccountIcon({ account }: { account: Pick<Account, 'icon' | 'name' | 'category'> }) {
  const icon = resolvedIcon(account)
  return <span className={`account-icon icon-${icon}`} aria-hidden="true">{iconContent[icon] ?? iconContent.custom}</span>
}
