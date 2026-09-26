import { describe, expect, it } from 'vitest'
import { availableMonthKeys, balanceDeltaFor, monthSummary, previousMonthKey, expenseCategories, incomeCategories, type Transaction } from './ledger'
import type { Account } from './domain'

const account = (category: Account['category']): Account => ({ id: category, name: category, category, balance: 500, note: '', icon: 'auto', createdAt: '', updatedAt: '' })
const record = (type: Transaction['type'], amount: number, date: string): Transaction => ({
  id: crypto.randomUUID(), type, amount, date, category: type === 'expense' ? '饮食' : '工资', subcategory: '', accountId: 'bank', accountName: '银行', note: '', syncBalance: false, balanceDelta: 0, createdAt: '', updatedAt: '',
})

describe('simple ledger rules', () => {
  it('provides the requested broad expense and income categories', () => {
    expect(expenseCategories).toContain('饮食')
    expect(expenseCategories).toContain('日用')
    expect(incomeCategories).toContain('生活费')
    expect(incomeCategories).toContain('投资收益')
  })

  it('subtracts an asset expense, increases a credit debt, and adds income', () => {
    expect(balanceDeltaFor({ type: 'expense', amount: 30, syncBalance: true }, account('virtual'))).toBe(-30)
    expect(balanceDeltaFor({ type: 'expense', amount: 200, syncBalance: true }, account('credit'))).toBe(200)
    expect(balanceDeltaFor({ type: 'income', amount: 1500, syncBalance: true }, account('bank'))).toBe(1500)
    expect(balanceDeltaFor({ type: 'expense', amount: 20, syncBalance: false }, account('virtual'))).toBe(0)
    expect(() => balanceDeltaFor({ type: 'income', amount: 100, syncBalance: true }, account('liability'))).toThrow('收入账户')
  })

  it('counts only the selected month and computes its balance', () => {
    expect(monthSummary([record('expense', 30, '2026-09-26'), record('income', 1500, '2026-09-25'), record('expense', 20, '2026-08-31')], '2026-09')).toEqual({ expense: 30, income: 1500, balance: 1470 })
  })

  it('finds last month even at the end of a long month', () => {
    expect(previousMonthKey(new Date(2026, 2, 31))).toBe('2026-02')
    expect(previousMonthKey(new Date(2026, 0, 1))).toBe('2025-12')
  })

  it('keeps older recorded months available alongside this and last month', () => {
    const months = availableMonthKeys([record('expense', 10, '2026-05-12'), record('income', 20, '2026-05-20')], new Date(2026, 8, 26))
    expect(months).toEqual(['2026-09', '2026-08', '2026-05'])
  })
})
