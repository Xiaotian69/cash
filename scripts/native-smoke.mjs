import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright'

const execFileAsync = promisify(execFile)
const executable = process.env.CASH_NATIVE_EXECUTABLE ?? resolve('src-tauri/target/release/personal-asset-manager.exe')
const profile = resolve('artifacts', `native-profile-${Date.now()}`)
const backupPath = resolve('artifacts', `native-backup-${Date.now()}.json`)
await mkdir(profile, { recursive: true })

let running = null
const errors = []

async function startNative(port) {
  const child = spawn(executable, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
      WEBVIEW2_USER_DATA_FOLDER: profile,
    },
    stdio: 'ignore',
    windowsHide: false,
  })
  let browser
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`Native app exited before WebView2 started: ${child.exitCode}`)
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 })
      break
    } catch {
      await new Promise((done) => setTimeout(done, 500))
    }
  }
  if (!browser) throw new Error('The native WebView2 debugging endpoint did not start')
  const context = browser.contexts()[0]
  assert.ok(context, 'native WebView2 context is missing')
  const page = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 10000 })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('heading', { name: '我的资产' }).waitFor({ timeout: 15000 })
  const profileEntries = await readdir(profile)
  assert.ok(profileEntries.length > 0, 'WebView2 did not use the isolated native profile')
  running = { child, browser, page }
  return running
}

async function closeNative() {
  assert.ok(running)
  const { child, browser } = running
  const script = `$process = Get-Process -Id ${child.pid} -ErrorAction Stop; if (-not $process.CloseMainWindow()) { throw 'No native main window' }; if (-not $process.WaitForExit(15000)) { throw 'Native window did not exit' }`
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, timeout: 20000 })
  await browser.close().catch(() => {})
  running = null
}

async function readData(page) {
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

async function addAccount(page, name, category, balance) {
  await page.locator('.add-button').click()
  await page.locator('#account-category').selectOption(category)
  await page.locator('#account-name').fill(name)
  await page.locator('#account-balance').fill(String(balance))
  await page.locator('.account-dialog').getByRole('button', { name: '添加账户' }).click()
  await page.locator('.account-dialog').waitFor({ state: 'hidden' })
}

async function addTransaction(page, type, amount, category, accountId) {
  await page.locator('.ledger-actions').getByRole('button', { name: type === 'expense' ? '记支出' : '记收入' }).click()
  await page.locator('#transaction-amount').fill(String(amount))
  await page.locator('#transaction-category').selectOption(category)
  await page.locator('#transaction-account').selectOption(accountId)
  await page.locator('.transaction-dialog').getByRole('button', { name: type === 'expense' ? '保存支出' : '保存收入' }).click()
  await page.locator('.transaction-dialog').waitFor({ state: 'hidden' })
}

function assertBalances(data) {
  assert.equal(data.accounts.find((account) => account.name === '原生验收微信')?.balance, 170)
  assert.equal(data.accounts.find((account) => account.name === '原生验收银行卡')?.balance, 600)
  assert.equal(data.transactions.length, 2)
  assert.equal(data.snapshots.length, 1)
  assert.equal(data.snapshots[0].netAssets, 770)
}

try {
  let { page, child } = await startNative(9333)
  assert.match(page.url(), /tauri/i, 'the test must run inside the Tauri WebView2 window')
  assert.equal((await readData(page)).accounts.length, 0, 'native test profile should start empty')
  console.log(`Native window launched: PID ${child.pid}, ${page.url()}`)

  await addAccount(page, '原生验收银行卡', 'bank', 500)
  await addAccount(page, '原生验收微信', 'virtual', 200)
  await page.getByRole('button', { name: '记账' }).click()
  const accounts = (await readData(page)).accounts
  const id = (name) => accounts.find((account) => account.name === name).id
  await addTransaction(page, 'expense', 30, '饮食', id('原生验收微信'))
  await addTransaction(page, 'income', 100, '工资', id('原生验收银行卡'))
  assertBalances(await readData(page))
  await closeNative()
  console.log('Native window closed normally after account and ledger writes.')

  ;({ page, child } = await startNative(9334))
  assertBalances(await readData(page))
  console.log(`Native window reopened: PID ${child.pid}; IndexedDB accounts and transactions persisted.`)

  await page.getByRole('button', { name: '设置' }).click()
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: /导出备份/ }).click()])
  await download.saveAs(backupPath)
  const backup = JSON.parse(await readFile(backupPath, 'utf8'))
  assert.equal(backup.accounts.length, 2)
  assert.equal(backup.transactions.length, 2)
  console.log(`Native JSON backup exported: ${backupPath}`)

  await page.getByRole('button', { name: /清空数据/ }).click()
  await page.getByRole('button', { name: '确认清空' }).click()
  assert.equal((await readData(page)).accounts.length, 0)
  assert.equal((await readData(page)).transactions.length, 0)
  await page.locator('input[type=file]').setInputFiles(backupPath)
  await page.getByRole('button', { name: '确认恢复' }).click()
  assertBalances(await readData(page))
  await closeNative()
  console.log('Native window closed normally after backup restore.')

  ;({ page, child } = await startNative(9335))
  assertBalances(await readData(page))
  await page.getByRole('button', { name: '图表' }).click()
  assert.match(await page.locator('.current-value').innerText(), /¥770\.00/)
  await closeNative()
  assert.deepEqual(errors, [])
  console.log(`Native smoke passed: launch, account and ledger writes, two normal restarts, IndexedDB persistence, JSON export, clear, import, and chart. Test profile: ${profile}`)
} finally {
  if (running) {
    try { await closeNative() } catch { running.child.kill() }
  }
}
