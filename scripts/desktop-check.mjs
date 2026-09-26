// Fictional demonstration data only; never use personal account data here.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const output = resolve('artifacts')
await mkdir(output, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

const now = new Date()
const dateKey = (daysAgo) => {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const entries = [
  ['工商银行', 'bank', 1250.2, 'icbc', '日常储蓄'],
  ['建设银行', 'bank', 12000.25, 'ccb', '日常银行卡'],
  ['招商银行', 'bank', 1549.4, 'cmb', ''],
  ['微信', 'virtual', 600.45, 'wechat', '零钱'],
  ['基金', 'investment', 3500.35, 'fund', '长期持有'],
  ['蚂蚁花呗', 'credit', 800.15, 'huabei', '本月待还'],
  ['分期余额', 'liability', 2400, 'debt', ''],
]
const accounts = entries.map(([name, category, balance, icon, note], index) => ({
  id: `visual-${index}`, name, category, balance, icon, note,
  createdAt: new Date(now.getTime() - 100000 + index).toISOString(),
  updatedAt: new Date(now.getTime() - 60000 + index).toISOString(),
}))
const snapshots = [20, 15, 10, 5, 0].map((daysAgo, index) => {
  const members = accounts.map(({ id, name, category, balance }) => ({
    id, name, category, balance: id === 'visual-1' ? balance - (4 - index) * 180 : balance,
  }))
  const totalAssets = Math.round(members.filter((account) => !['credit', 'liability'].includes(account.category)).reduce((sum, account) => sum + account.balance * 100, 0)) / 100
  const totalLiabilities = 3200.15
  return { date: dateKey(daysAgo), totalAssets, totalLiabilities, netAssets: Math.round((totalAssets - totalLiabilities) * 100) / 100, accounts: members }
})
const transactionSamples = [
  ['expense', 36.5, '饮食', '麦当劳', 'visual-3', 0],
  ['expense', 58.2, '购物', '日用品', 'visual-1', 0],
  ['income', 1500, '生活费', '示例收入', 'visual-1', 0],
  ['expense', 4, '交通', '地铁', 'visual-3', 1],
]
const transactions = transactionSamples.map(([type, amount, category, subcategory, accountId, daysAgo], index) => ({
  id: `visual-transaction-${index}`, type, amount, category, subcategory, accountId,
  accountName: accounts.find((account) => account.id === accountId).name,
  date: dateKey(daysAgo), note: '', syncBalance: false, balanceDelta: 0,
  createdAt: new Date(now.getTime() - index * 1000).toISOString(),
  updatedAt: new Date(now.getTime() - index * 1000).toISOString(),
}))
const backup = { format: 'personal-asset-manager', version: 1, exportedAt: now.toISOString(), accounts, snapshots, transactions, settings: { currencySymbol: '¥' } }

async function box(selector) {
  const bounds = await page.locator(selector).first().boundingBox()
  assert.ok(bounds, `${selector} is not visible`)
  return bounds
}

try {
  await page.goto('http://127.0.0.1:5173/')
  await page.getByRole('heading', { name: '我的资产' }).waitFor()
  await page.getByRole('button', { name: '设置' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'desktop-check.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await page.getByRole('button', { name: '确认恢复' }).click()
  await page.getByRole('button', { name: '资产' }).click()
  await page.locator('.account-row').first().waitFor()

  for (const [width, height] of [[900, 600], [1366, 768], [1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width, height })
    await page.getByRole('heading', { name: '我的资产' }).waitFor()
    const sidebar = await box('.app-sidebar')
    assert.ok(sidebar.width >= 190 && sidebar.width <= 220, `${width}: sidebar width ${sidebar.width}`)
    assert.equal(await page.locator('.summary-metric').count(), 3)
    const summary = await box('.summary-metric')
    assert.ok(summary.height >= 105 && summary.height <= 150, `${width}: summary height ${summary.height}`)
    const row = await box('.account-row')
    assert.ok(row.height >= 56 && row.height <= 64, `${width}: account row height ${row.height}`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: horizontal overflow`)
    if (width === 1920) {
      const content = await box('.page-content')
      assert.ok(content.width <= 1400, `1920: content width ${content.width}`)
      await page.screenshot({ path: resolve(output, 'assets-1920x1080.png') })
    }
    if (width === 1366) await page.screenshot({ path: resolve(output, 'assets-1366x768.png') })
  }

  for (const [width, height] of [[1366, 768], [1920, 1080]]) {
    await page.setViewportSize({ width, height })
    await page.getByRole('button', { name: '图表' }).click()
    const trend = await box('.trend-card')
    assert.ok(trend.height <= 390, `${width}: trend card height ${trend.height}`)
    const firstPoint = await page.locator('.trend-svg circle').first().boundingBox()
    const lastPoint = await page.locator('.trend-svg circle').last().boundingBox()
    assert.ok(firstPoint && lastPoint && (lastPoint.x - firstPoint.x) > trend.width * .7, `${width}: trend uses too little horizontal space`)
    const composition = await box('.status-card')
    const ranking = await box('.ranking-card')
    assert.ok(Math.abs(composition.y - ranking.y) < 2 && ranking.x > composition.x, `${width}: chart panels are not side by side`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: chart horizontal overflow`)
    await page.waitForTimeout(180)
    if (width === 1920) await page.screenshot({ path: resolve(output, 'charts-1920x1080.png') })
    if (width === 1366) await page.screenshot({ path: resolve(output, 'charts-1366x768.png') })
    await page.getByRole('button', { name: '资产' }).click()
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.locator('.account-row').first().click()
  const accountDialog = await box('.account-dialog')
  assert.ok(accountDialog.width >= 420 && accountDialog.width <= 520, `account modal width ${accountDialog.width}`)
  await page.locator('.account-dialog').getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '记账' }).click()
  const transactionRow = await box('.ledger-row')
  assert.ok(transactionRow.height >= 56 && transactionRow.height <= 64, `ledger row height ${transactionRow.height}`)
  await page.waitForTimeout(180)
  await page.screenshot({ path: resolve(output, 'ledger-1920x1080.png') })
  await page.getByRole('button', { name: '记支出' }).first().click()
  const transactionDialog = await box('.transaction-dialog')
  assert.ok(transactionDialog.width >= 460 && transactionDialog.width <= 520, `transaction modal width ${transactionDialog.width}`)
  await page.keyboard.press('Control+N')
  assert.equal(await page.locator('.account-dialog').count(), 0, 'Ctrl+N should not open another modal over the ledger editor')
  await page.getByRole('button', { name: '关闭' }).click()
  await page.getByRole('button', { name: '设置' }).click()
  await page.waitForTimeout(180)
  await page.screenshot({ path: resolve(output, 'settings-1920x1080.png') })
  assert.deepEqual(errors, [])
  console.log(`Desktop layout passed. Screenshots: ${output}`)
} finally {
  await browser.close()
}
