import { useRef, useState, type ChangeEvent } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, Database, ShieldCheck, Trash2, X } from 'lucide-react'
import { createBackup, parseBackup } from './backup'
import { localDateKey } from './domain'
import type { AppData } from './storage'

interface SettingsPageProps {
  data: AppData
  onImport: (data: AppData) => Promise<boolean>
  onClear: () => Promise<boolean>
  onCurrency: (symbol: string) => Promise<boolean>
}

export function SettingsPage({ data, onImport, onClear, onCurrency }: SettingsPageProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<{ filename: string; data: AppData } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  function exportData() {
    try {
      const backup = createBackup(data)
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `personal-finance-backup-${localDateKey()}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 10000)
      setNotice('备份文件已生成，请妥善保存。')
    } catch {
      setNotice('导出失败，请重试。')
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const restored = parseBackup(await file.text())
      setPendingImport({ filename: file.name, data: restored })
      setNotice('')
    } catch (error) {
      setNotice(error instanceof Error ? `导入失败：${error.message}` : '导入失败：文件格式不正确')
    }
  }

  async function restore() {
    if (!pendingImport) return
    setBusy(true)
    try {
      if (await onImport(pendingImport.data)) {
        setPendingImport(null)
        setNotice('备份已恢复，账户与历史数据已更新。')
      }
    } finally { setBusy(false) }
  }

  async function clear() {
    setBusy(true)
    try {
      if (await onClear()) {
        setConfirmClear(false)
        setNotice('本地数据已清空。')
      }
    } finally { setBusy(false) }
  }

  return <div className="page-content settings-page">
    <div className="page-heading"><div><h1>设置</h1><p className="heading-subtitle">备份和管理本地数据</p></div></div>

    <div className="settings-intro"><ShieldCheck size={23} /><div><strong>数据只保存在这台电脑上</strong><span>建议定期导出 JSON 备份，保存在你选择的文件夹。</span></div></div>

    <section className="settings-section">
      <h2>数据备份</h2>
      <div className="settings-card">
        <button className="setting-row" type="button" onClick={exportData}><span className="setting-icon yellow"><ArrowDownToLine size={20} /></span><span className="setting-copy"><strong>导出备份</strong><small>下载账户、流水和全部历史记录</small></span><ChevronRight size={18} /></button>
        <button className="setting-row" type="button" onClick={() => fileInput.current?.click()}><span className="setting-icon blue"><ArrowUpFromLine size={20} /></span><span className="setting-copy"><strong>导入备份</strong><small>从 JSON 文件恢复完整数据</small></span><ChevronRight size={18} /></button>
        <input ref={fileInput} type="file" accept=".json,application/json" className="visually-hidden" onChange={chooseFile} aria-label="选择 JSON 备份文件" />
      </div>
    </section>

    <section className="settings-section">
      <h2>显示偏好</h2>
      <div className="settings-card">
        <div className="setting-row"><span className="setting-icon neutral"><Database size={20} /></span><span className="setting-copy"><strong>货币符号</strong><small>只改变显示，不换算金额</small></span><select aria-label="货币符号" className="currency-select" value={data.settings.currencySymbol} onChange={async (event) => { if (await onCurrency(event.target.value)) setNotice('货币符号已更新。') }}><option value="¥">人民币 ¥</option><option value="$">美元 $</option><option value="€">欧元 €</option><option value="£">英镑 £</option></select></div>
      </div>
    </section>

    <section className="settings-section danger-section">
      <h2>数据管理</h2>
      <div className="settings-card"><button className="setting-row" type="button" onClick={() => setConfirmClear(true)}><span className="setting-icon red"><Trash2 size={20} /></span><span className="setting-copy"><strong>清空数据</strong><small>删除本机所有账户、流水和历史记录</small></span><ChevronRight size={18} /></button></div>
    </section>

    {notice && <div className="settings-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="关闭提示"><X size={16} /></button></div>}

    {(pendingImport || confirmClear) && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) { setPendingImport(null); setConfirmClear(false) } }}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{pendingImport ? '恢复备份' : '清空所有数据'}</h2>
        {pendingImport ? <p>将使用「{pendingImport.filename}」中的 {pendingImport.data.accounts.length} 个账户、{pendingImport.data.transactions.length} 笔流水和 {pendingImport.data.snapshots.length} 天历史记录覆盖当前数据。</p> : <p>这会删除本机所有账户、流水和历史记录。建议先导出备份，清空后无法撤销。</p>}
        <div className="confirm-actions"><button className="button button-plain" type="button" disabled={busy} onClick={() => { setPendingImport(null); setConfirmClear(false) }}>取消</button><button className={`button ${pendingImport ? 'button-yellow' : 'button-danger'}`} type="button" disabled={busy} onClick={pendingImport ? restore : clear}>{pendingImport ? '确认恢复' : '确认清空'}</button></div>
      </div>
    </div>}
  </div>
}
