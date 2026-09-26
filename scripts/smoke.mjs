import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:5173/')) errors.push(`Unexpected request: ${request.url()}`) })

async function readData() {
  return page.evaluate(async () => {
    const request = indexedDB.open('personal-asset-manager', 2)
    const database = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const transaction = database.transaction(['accounts', 'snapshots', 'transactions'], 'readonly')
    const getAll = (name) => new Promise((resolve, reject) => { const row = transaction.objectStore(name).getAll(); row.onsuccess = () => resolve(row.result); row.onerror = () => reject(row.error) })
    const [accounts, snapshots, transactions] = await Promise.all([getAll('accounts'), getAll('snapshots'), getAll('transactions')])
    database.close()
    return { accounts, snapshots, transactions }
  })
}

async function addAccount(name, category, balance) {
  await page.locator('.add-button').click()
  await page.locator('#account-name').fill(name)
  await page.locator('#account-category').selectOption(category)
  await page.locator('#account-balance').fill(String(balance))
  await page.locator('.account-dialog').getByRole('button', { name: '添加账户' }).click()
  await page.locator('.account-dialog').waitFor({ state: 'hidden' })
}

async function record({ type, amount, category, accountId, subcategory = '', sync = true, date }) {
  await page.locator('.ledger-actions').getByRole('button', { name: type === 'expense' ? '记支出' : '记收入' }).click()
  await page.locator('#transaction-amount').fill(String(amount))
  await page.locator('#transaction-category').selectOption(category)
  await page.locator('#transaction-subcategory').fill(subcategory)
  await page.locator('#transaction-account').selectOption(accountId)
  if (!sync) await page.locator('.sync-toggle input').uncheck()
  if (date) await page.locator('#transaction-date').fill(date)
  await page.locator('.transaction-dialog').getByRole('button', { name: type === 'expense' ? '保存支出' : '保存收入' }).click()
  await page.locator('.transaction-dialog').waitFor({ state: 'hidden' })
}

const amount = (data, name) => data.accounts.find((account) => account.name === name)?.balance
const lastTotals = (data) => data.snapshots.at(-1)

try {
  await page.goto('http://127.0.0.1:5173/')
  await page.getByRole('heading', { name: '我的资产' }).waitFor()
  assert.equal((await readData()).accounts.length, 0, 'a fresh profile should not contain demo accounts')

  await addAccount('微信', 'virtual', 500)
  await addAccount('花呗', 'credit', 1000)
  await addAccount('建设银行', 'bank', 5000)
  await addAccount('临时账户', 'cash', 1)
  await page.locator('.account-row').filter({ hasText: '临时账户' }).click()
  await page.getByRole('button', { name: '删除账户', exact: true }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await page.locator('.account-dialog').waitFor({ state: 'hidden' })
  assert.equal((await readData()).accounts.length, 3)

  await page.locator('.account-row').filter({ hasText: '建设银行' }).click()
  await page.getByRole('button', { name: '编辑账户资料' }).click()
  await page.locator('#account-note').fill('生活费银行卡')
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.locator('.account-dialog').waitFor({ state: 'hidden' })
  assert.equal((await readData()).accounts.find((account) => account.name === '建设银行').note, '生活费银行卡')

  await page.locator('.account-row').filter({ hasText: '建设银行' }).click()
  await page.getByRole('button', { name: '编辑账户资料' }).click()
  await page.locator('#account-name').fill('已取消的名称')
  await page.locator('#account-category').selectOption('credit')
  await page.locator('#account-note').fill('已取消的备注')
  await page.locator('.account-dialog').getByRole('button', { name: '返回' }).click()
  await page.getByRole('button', { name: '保存余额' }).click()
  await page.locator('.account-dialog').waitFor({ state: 'hidden' })
  const unchangedAccount = (await readData()).accounts.find((account) => account.name === '建设银行')
  assert.equal(unchangedAccount.category, 'bank', 'cancelled account edits must not alter the category')
  assert.equal(unchangedAccount.note, '生活费银行卡', 'cancelled account edits must not alter the note')
  assert.equal((await readData()).accounts.some((account) => account.name === '已取消的名称'), false)

  await page.getByRole('button', { name: '记账' }).click()
  const accounts = (await readData()).accounts
  const id = (name) => accounts.find((account) => account.name === name).id
  await record({ type: 'expense', amount: 30, category: '饮食', subcategory: '麦当劳', accountId: id('微信') })
  let data = await readData()
  assert.equal(amount(data, '微信'), 470)
  assert.equal(lastTotals(data).totalAssets, 5470)
  assert.equal(lastTotals(data).netAssets, 4470)
  assert.match(await page.locator('.ledger-row').filter({ hasText: '麦当劳' }).innerText(), /-¥30\.00/)

  await record({ type: 'expense', amount: 200, category: '购物', subcategory: '衣服', accountId: id('花呗') })
  data = await readData()
  assert.equal(amount(data, '花呗'), 1200)
  assert.equal(lastTotals(data).totalLiabilities, 1200)
  assert.equal(lastTotals(data).netAssets, 4270)

  await record({ type: 'income', amount: 1500, category: '生活费', accountId: id('建设银行') })
  data = await readData()
  assert.equal(amount(data, '建设银行'), 6500)
  assert.equal(lastTotals(data).netAssets, 5770)
  assert.match(await page.locator('.ledger-summary').innerText(), /¥1,500\.00/)

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
  const beforeUnsynced = await readData()
  await record({ type: 'expense', amount: 20, category: '饮食', subcategory: '补记', accountId: id('微信'), sync: false, date: yesterdayKey })
  data = await readData()
  assert.equal(amount(data, '微信'), 470)
  assert.deepEqual(data.snapshots, beforeUnsynced.snapshots)
  assert.equal(data.transactions.find((transaction) => transaction.subcategory === '补记').balanceDelta, 0)

  await page.locator('.ledger-row').filter({ hasText: '麦当劳' }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  assert.equal(await page.locator('.restore-check input').isChecked(), true)
  await page.getByRole('button', { name: '确认删除' }).click()
  await page.locator('.transaction-dialog').waitFor({ state: 'hidden' })
  assert.equal(amount(await readData(), '微信'), 500)

  await record({ type: 'expense', amount: 50, category: '饮食', subcategory: '编辑测试', accountId: id('微信') })
  await page.locator('.ledger-row').filter({ hasText: '编辑测试' }).click()
  await page.locator('.transaction-dialog').getByRole('button', { name: '编辑', exact: true }).click()
  await page.locator('#transaction-amount').fill('80')
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.locator('.transaction-dialog').waitFor({ state: 'hidden' })
  data = await readData()
  assert.equal(amount(data, '微信'), 420)
  assert.equal(data.transactions.find((transaction) => transaction.subcategory === '编辑测试').amount, 80)
  assert.equal(data.snapshots.length, 1, 'only one snapshot per calendar day')

  const oldDate = new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1)
  const oldDateKey = `${oldDate.getFullYear()}-${String(oldDate.getMonth() + 1).padStart(2, '0')}-01`
  await record({ type: 'expense', amount: 12, category: '交通', subcategory: '历史流水', accountId: id('微信'), sync: false, date: oldDateKey })
  await page.getByLabel('流水月份').selectOption(oldDateKey.slice(0, 7))
  assert.match(await page.locator('.ledger-row').innerText(), /历史流水/)
  assert.match(await page.locator('.ledger-summary').innerText(), new RegExp(`${oldDate.getFullYear()}年${oldDate.getMonth() + 1}月支出`))
  await page.locator('.ledger-row').filter({ hasText: '历史流水' }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await page.locator('.transaction-dialog').waitFor({ state: 'hidden' })
  assert.equal(await page.getByLabel('流水月份').inputValue(), oldDateKey.slice(0, 7), 'the selected month should remain available after its final entry is deleted')
  await record({ type: 'expense', amount: 12, category: '交通', subcategory: '历史流水', accountId: id('微信'), sync: false, date: oldDateKey })
  await page.getByLabel('流水月份').selectOption(yesterdayKey.slice(0, 7))

  await page.getByRole('button', { name: '资产', exact: true }).click()
  await addAccount('待删除账户', 'cash', 100)
  const deletedAccountId = (await readData()).accounts.find((account) => account.name === '待删除账户').id
  await page.getByRole('button', { name: '记账' }).click()
  await record({ type: 'expense', amount: 20, category: '饮食', subcategory: '账户删除测试', accountId: deletedAccountId })
  await page.getByRole('button', { name: '资产', exact: true }).click()
  await page.locator('.account-row').filter({ hasText: '待删除账户' }).click()
  await page.getByRole('button', { name: '删除账户', exact: true }).click()
  assert.match(await page.locator('.inline-confirm').innerText(), /关联的 1 笔流水/)
  await page.getByRole('button', { name: '确认删除' }).click()
  await page.locator('.account-dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '记账' }).click()
  await page.locator('.ledger-row').filter({ hasText: '账户删除测试' }).click()
  assert.match(await page.locator('.transaction-detail').innerText(), /原账户已删除/)
  await page.locator('.transaction-dialog').getByRole('button', { name: '编辑', exact: true }).click()
  await page.locator('#transaction-account').selectOption(id('微信'))
  await page.locator('.sync-toggle input').uncheck()
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.locator('.transaction-dialog').waitFor({ state: 'hidden' })
  await page.locator('.ledger-row').filter({ hasText: '账户删除测试' }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await page.locator('.transaction-dialog').waitFor({ state: 'hidden' })
  assert.equal(amount(await readData(), '微信'), 420)

  await page.getByRole('button', { name: '图表' }).click()
  assert.match(await page.locator('.current-value').innerText(), /¥5,720\.00/)
  await page.getByRole('button', { name: '设置' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /导出备份/ }).click()])
  const backupPath = join(tmpdir(), `cash-smoke-backup-${Date.now()}.json`)
  await download.saveAs(backupPath)
  const backup = JSON.parse(await readFile(backupPath, 'utf8'))
  assert.equal(backup.accounts.length, 3)
  assert.equal(backup.transactions.length, 5)

  const largeBackup = { ...backup, transactions: Array.from({ length: 30000 }, (_, index) => ({ ...backup.transactions[0], id: `large-${index}`, note: 'x'.repeat(200), syncBalance: false, balanceDelta: 0 })) }
  const largeInputPath = join(tmpdir(), `cash-large-input-${Date.now()}.json`)
  await writeFile(largeInputPath, JSON.stringify(largeBackup, null, 2))
  assert.ok((await readFile(largeInputPath)).byteLength > 10 * 1024 * 1024, 'large backup must cross the previous import limit')
  await page.locator('input[type=file]').setInputFiles(largeInputPath)
  await page.getByRole('button', { name: '确认恢复' }).click()
  assert.equal((await readData()).transactions.length, 30000)
  const [largeDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /导出备份/ }).click()])
  const largeExportPath = join(tmpdir(), `cash-large-export-${Date.now()}.json`)
  await largeDownload.saveAs(largeExportPath)
  assert.ok((await readFile(largeExportPath)).byteLength > 10 * 1024 * 1024)
  await page.getByRole('button', { name: /清空数据/ }).click()
  await page.getByRole('button', { name: '确认清空' }).click()
  await page.locator('input[type=file]').setInputFiles(largeExportPath)
  await page.getByRole('button', { name: '确认恢复' }).click()
  assert.equal((await readData()).transactions.length, 30000, 'an app-exported large backup must be restorable')

  await page.getByRole('button', { name: /清空数据/ }).click()
  await page.getByRole('button', { name: '确认清空' }).click()
  assert.equal((await readData()).transactions.length, 0)
  await page.reload()
  await page.getByRole('button', { name: '设置' }).click()
  await page.locator('input[type=file]').setInputFiles(backupPath)
  await page.getByRole('button', { name: '确认恢复' }).click()
  await page.reload()
  data = await readData()
  assert.equal(data.accounts.length, 3)
  assert.equal(data.transactions.length, 5)
  assert.equal(amount(data, '微信'), 420)
  assert.deepEqual(errors, [])
  console.log('Browser smoke passed: account CRUD, six ledger cases, deleted-account history, snapshots, charts, large backup, clear, restore, reload, offline requests.')
} finally {
  await browser.close()
}
