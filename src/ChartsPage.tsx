import { useEffect, useRef, useState } from 'react'
import { AccountIcon } from './AccountIcon'
import {
  CATEGORIES,
  calculateTotals,
  categoryTotals,
  filterSnapshots,
  formatMoney,
  formatNumber,
  isLiability,
  type Account,
  type ChartMode,
  type Range,
  type Snapshot,
} from './domain'

interface ChartsPageProps {
  accounts: Account[]
  snapshots: Snapshot[]
  currencySymbol: string
}

const MODES: { id: ChartMode; label: string }[] = [
  { id: 'asset', label: '资产' },
  { id: 'liability', label: '负债' },
  { id: 'net', label: '净资产' },
]

const RANGES: { id: Range; label: string }[] = [
  { id: '30d', label: '最近30天' },
  { id: '90d', label: '最近90天' },
  { id: 'year', label: '今年' },
  { id: 'all', label: '全部' },
]

function snapshotValue(snapshot: Snapshot, mode: ChartMode): number {
  if (mode === 'asset') return snapshot.totalAssets
  if (mode === 'liability') return snapshot.totalLiabilities
  return snapshot.netAssets
}

function dateLabel(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}月${Number(day)}日`
}

function TrendChart({ snapshots, mode, currencySymbol }: { snapshots: Snapshot[]; mode: ChartMode; currencySymbol: string }) {
  const container = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(840)
  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(([entry]) => setChartWidth(Math.max(250, entry.contentRect.width)))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  if (snapshots.length === 0) {
    return <div className="chart-empty"><span>这个时间范围还没有记录</span><small>更新账户余额后会自动保存当天快照</small></div>
  }

  const values = snapshots.map((snapshot) => snapshotValue(snapshot, mode))
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const padding = Math.max(1, Math.abs(maximum) * .08, (maximum - minimum) * .2)
  const low = minimum - padding
  const high = maximum + padding
  const startX = 60
  const endX = chartWidth - 20
  const points = values.map((value, index) => ({
    x: snapshots.length === 1 ? (startX + endX) / 2 : startX + index * (endX - startX) / (snapshots.length - 1),
    y: 155 - (value - low) / (high - low) * 120,
    value,
    date: snapshots[index].date,
    snapshot: snapshots[index],
  }))
  const color = mode === 'liability' ? '#de8f83' : '#e2b43b'

  return <div className="trend-chart" ref={container}>
    <svg className="trend-svg" viewBox={`0 0 ${chartWidth} 184`} role="img" aria-label={`${MODES.find((item) => item.id === mode)?.label}走势图，共 ${snapshots.length} 个日期`}>
      {[35, 95, 155].map((y) => <line key={y} x1={startX} y1={y} x2={endX} y2={y} stroke="#ecece8" strokeWidth="1" />)}
      <text x="0" y="39" className="chart-axis">{formatNumber(high)}</text><text x="0" y="159" className="chart-axis">{formatNumber(low)}</text>
      {points.length > 1 && <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="5.5" fill="#fff" stroke={color} strokeWidth="3"><title>{point.date}\n净资产 {formatMoney(point.snapshot.netAssets, currencySymbol)}\n总资产 {formatMoney(point.snapshot.totalAssets, currencySymbol)}\n总负债 {formatMoney(point.snapshot.totalLiabilities, currencySymbol)}</title></circle>)}
    </svg>
    <div className="chart-dates"><span>{dateLabel(snapshots[0].date)}</span><span>{snapshots.length > 1 ? dateLabel(snapshots[snapshots.length - 1].date) : '今日记录'}</span></div>
    {snapshots.length === 1 && <p className="chart-note">当前只有 1 天记录，后续日期更新余额后会形成走势。</p>}
  </div>
}

function Distribution({ accounts, kind, currencySymbol }: { accounts: Account[]; kind: 'asset' | 'liability'; currencySymbol: string }) {
  const segments = categoryTotals(accounts, kind)
  const total = segments.reduce((sum, segment) => sum + segment.amount, 0)
  const circumference = 2 * Math.PI * 68
  const arcs = segments.map((segment, index) => ({
    ...segment,
    length: total > 0 ? segment.amount / total * circumference : 0,
    start: total > 0 ? segments.slice(0, index).reduce((sum, previous) => sum + previous.amount / total * circumference, 0) : 0,
  }))
  return <div className="distribution">
    <div className="donut-wrap">
      <svg viewBox="0 0 190 190" className="donut" role="img" aria-label={`当前${kind === 'asset' ? '资产' : '负债'}类别占比`}>
        <circle cx="95" cy="95" r="68" fill="none" stroke="#f2f2ef" strokeWidth="24" />
        {arcs.map((segment) => {
          const color = CATEGORIES.find((category) => category.id === segment.category)?.color ?? '#aaa'
          return <circle key={segment.category} cx="95" cy="95" r="68" fill="none" stroke={color} strokeWidth="24" strokeDasharray={`${segment.length} ${circumference - segment.length}`} strokeDashoffset={-segment.start} transform="rotate(-90 95 95)" />
        })}
      </svg>
      <div className="donut-center"><span>{kind === 'asset' ? '总资产' : '总负债'}</span><strong>{formatMoney(total, currencySymbol)}</strong></div>
    </div>
    <div className="distribution-legend">
      {segments.length === 0 ? <p className="subtle">暂无{kind === 'asset' ? '资产' : '负债'}账户</p> : segments.map((segment) => {
        const meta = CATEGORIES.find((category) => category.id === segment.category)!
        return <div className="legend-row" key={segment.category}><span className="legend-dot" style={{ background: meta.color }} /><span>{meta.label}</span><strong>{(segment.amount / total * 100).toFixed(1)}%</strong></div>
      })}
    </div>
  </div>
}

export function ChartsPage({ accounts, snapshots, currencySymbol }: ChartsPageProps) {
  const [mode, setMode] = useState<ChartMode>('net')
  const [range, setRange] = useState<Range>('30d')
  const filtered = filterSnapshots(snapshots, range)
  const totals = calculateTotals(accounts)
  const latest = mode === 'asset' ? totals.totalAssets : mode === 'liability' ? totals.totalLiabilities : totals.netAssets
  const kind = mode === 'liability' ? 'liability' : 'asset'
  const rankAccounts = accounts.filter((account) => isLiability(account.category) === (kind === 'liability'))
    .sort((a, b) => b.balance - a.balance)
  const rankTotal = kind === 'asset' ? totals.totalAssets : totals.totalLiabilities
  const heading = mode === 'asset' ? '资产' : mode === 'liability' ? '负债' : '净资产'

  return <div className="page-content charts-page">
    <div className="page-heading"><div><h1>资产分析</h1><p className="heading-subtitle">了解余额构成与净资产变化</p></div></div>
    <div className="mode-tabs" role="tablist" aria-label="图表类型">{MODES.map((item) => <button key={item.id} className={mode === item.id ? 'active' : ''} onClick={() => setMode(item.id)} type="button" role="tab" aria-selected={mode === item.id}>{item.label}</button>)}</div>

    <section className="chart-card trend-card">
      <div className="chart-card-top"><div><h2>{heading}走势图</h2></div><span className="current-value">当前 {formatMoney(latest, currencySymbol)}</span></div>
      <div className="range-tabs" aria-label="时间范围">{RANGES.map((item) => <button key={item.id} className={range === item.id ? 'active' : ''} onClick={() => setRange(item.id)} type="button">{item.label}</button>)}</div>
      <TrendChart snapshots={filtered} mode={mode} currencySymbol={currencySymbol} />
    </section>

    <div className="chart-lower-grid"><section className="chart-card status-card">
      <div className="chart-card-top"><div><h2>当前{kind === 'asset' ? '资产' : '负债'}状况</h2></div></div>
      {mode === 'net' && <p className="net-explainer">净资产 = 总资产 - 总负债；下图展示资产的构成。</p>}
      <Distribution accounts={accounts} kind={kind} currencySymbol={currencySymbol} />
    </section>

    <section className="chart-card ranking-card">
      <div className="chart-card-top"><div><h2>{kind === 'asset' ? '资产' : '负债'}排行榜</h2></div><span className="subtle">按金额排序</span></div>
      {rankAccounts.length === 0 ? <div className="ranking-empty">暂无账户</div> : rankAccounts.map((account, index) => {
        const percentage = rankTotal > 0 ? account.balance / rankTotal * 100 : 0
        return <div className="ranking-row" key={account.id}>
          <span className="rank-number">{String(index + 1).padStart(2, '0')}</span>
          <AccountIcon account={account} />
          <div className="rank-body"><div className="rank-line"><strong>{account.name}</strong><span>{percentage.toFixed(1)}%</span></div><div className="rank-track"><span style={{ width: `${percentage}%`, background: kind === 'asset' ? '#ffda4e' : '#eaa494' }} /></div></div>
          <strong className="rank-amount">{formatMoney(kind === 'liability' ? -account.balance : account.balance, currencySymbol)}</strong>
        </div>
      })}
    </section></div>
  </div>
}
