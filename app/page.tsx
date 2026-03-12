'use client'

import { useEffect, useState, useCallback } from 'react'

interface Pick {
  id: number
  game_date: string
  game_time: string | null
  home_team: string
  away_team: string
  bet_type: 'spread' | 'total'
  bet_side_spread: string
  bet_side_total: string
  line_spread: number | null
  line_total: number | null
  pred_spread: number | null
  pred_total: number | null
  spread_edge: number | null
  total_edge: number | null
  confidence: string
  result: string | null
  home_score: number | null
  away_score: number | null
  live_status: string | null
  injury_notes: string | null
}

interface BotRecord {
  wins: number
  losses: number
  pushes: number
  units: number
}

interface GameGroup {
  home_team: string
  away_team: string
  game_time: string | null
  spread: Pick | null
  total: Pick | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortName(full: string): string {
  // Return last word (mascot) unless it's ambiguous
  const parts = full.trim().split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : full
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
    })
  } catch { return '—' }
}

function fmtEdge(v: number | null | undefined): string {
  if (v == null) return ''
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`
}

function isStrongEdge(v: number | null | undefined): boolean {
  return v != null && Math.abs(v) >= 7
}

function gameStatus(g: GameGroup): 'pre' | 'live' | 'final' {
  const s = g.spread?.live_status || g.total?.live_status || ''
  if (s === 'final') return 'final'
  if (s && s !== 'pre' && s !== '') return 'live'
  return 'pre'
}

function spreadBetLabel(p: Pick): string {
  if (!p.line_spread) return '—'
  const line = p.line_spread
  if (p.bet_side_spread === 'home') {
    return `${shortName(p.home_team)} ${line >= 0 ? '+' : ''}${line}`
  }
  const awayLine = -line
  return `${shortName(p.away_team)} ${awayLine >= 0 ? '+' : ''}${awayLine}`
}

function totalBetLabel(p: Pick): string {
  if (!p.line_total) return '—'
  return `${p.bet_side_total === 'over' ? 'Over' : 'Under'} ${p.line_total}`
}

function spreadMarketLabel(p: Pick): string {
  if (!p.line_spread) return '—'
  const line = p.line_spread
  // line is from home perspective; negative = home favored
  if (line < 0) return `${shortName(p.home_team)} ${line}`
  if (line > 0) return `${shortName(p.away_team)} -${line}`
  return 'PK'
}

function modelSpreadLabel(p: Pick): string {
  if (p.pred_spread == null) return '—'
  const ps = p.pred_spread
  if (ps > 0) return `${shortName(p.home_team)} -${ps.toFixed(1)}`
  if (ps < 0) return `${shortName(p.away_team)} -${Math.abs(ps).toFixed(1)}`
  return 'PK'
}

function overallResult(g: GameGroup): string | null {
  const results = [g.spread?.result, g.total?.result].filter(Boolean) as string[]
  if (results.length === 0) return null
  if (results.every(r => r === 'pending' || r == null)) return 'pending'
  if (results.some(r => r === 'win')) return 'win'
  if (results.some(r => r === 'loss')) return 'loss'
  return 'push'
}

function hitRate(wins: number, losses: number): string {
  const total = wins + losses
  if (total === 0) return '0.0%'
  return `${((wins / total) * 100).toFixed(1)}%`
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [games, setGames] = useState<GameGroup[]>([])
  const [record, setRecord] = useState<BotRecord>({ wins: 0, losses: 0, pushes: 0, units: 0 })
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [picksRes, recRes] = await Promise.all([
        fetch(`/api/picks?date=${date}`),
        fetch('/api/record'),
      ])
      const picks: Pick[] = await picksRes.json()
      const rec: BotRecord = await recRes.json()

      const grouped: { [key: string]: GameGroup } = {}
      for (const p of picks) {
        const key = `${p.away_team}||${p.home_team}`
        if (!grouped[key]) {
          grouped[key] = { home_team: p.home_team, away_team: p.away_team, game_time: p.game_time, spread: null, total: null }
        }
        if (p.bet_type === 'spread') grouped[key].spread = p
        if (p.bet_type === 'total')  grouped[key].total  = p
      }

      const sorted = Object.values(grouped).sort((a, b) => {
        if (!a.game_time) return 1
        if (!b.game_time) return -1
        return new Date(a.game_time).getTime() - new Date(b.game_time).getTime()
      })

      setGames(sorted)
      setRecord(rec)
      setUpdatedAt(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    setLoading(true)
    fetchAll()
    const interval = setInterval(fetchAll, 60000)
    return () => clearInterval(interval)
  }, [fetchAll])

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const todayWins   = games.filter(g => overallResult(g) === 'win').length
  const todayLosses = games.filter(g => overallResult(g) === 'loss').length

  return (
    <>
      {/* ── Header ── */}
      <div className="header">
        <div className="header-left">
          <span className="logo">🏀</span>
          <h1>CBB Picks</h1>
        </div>
        <div className="header-right">
          {updatedAt && (
            <span className="updated">
              Updated {updatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setLoading(true) }}
            className="date-badge"
            style={{ cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-label">Record</div>
          <div className="stat-value">{record.wins}-{record.losses}-{record.pushes}</div>
          <div className="stat-sub">{hitRate(record.wins, record.losses)} hit rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Units</div>
          <div className={`stat-value ${record.units >= 0 ? 'positive' : 'negative'}`}>
            {record.units >= 0 ? '+' : ''}{record.units?.toFixed(1)}u
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Today W</div>
          <div className="stat-value">{todayWins}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Today L</div>
          <div className="stat-value">{todayLosses}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Today&apos;s Games</div>
          <div className="stat-value">{games.length}</div>
        </div>
      </div>

      {/* ── Game cards ── */}
      {loading ? (
        <div className="loading">Loading picks…</div>
      ) : games.length === 0 ? (
        <div className="loading">No picks for {displayDate}</div>
      ) : (
        <div className="games-grid">
          {games.map((g, i) => {
            const sp = g.spread
            const tp = g.total
            const status = gameStatus(g)
            const liveLabel = sp?.live_status || tp?.live_status || ''
            const hasScore = (sp?.home_score ?? tp?.home_score) != null
            const homeScore = sp?.home_score ?? tp?.home_score
            const awayScore = sp?.away_score ?? tp?.away_score
            const result = overallResult(g)
            const homeFinal = status === 'final' && hasScore
            const homeWon = homeFinal && (homeScore ?? 0) > (awayScore ?? 0)

            return (
              <div key={i} className={`game-card status-${status}`}>

                {/* Teams + score */}
                <div className="teams-col">
                  <div className="team-row">
                    <span className={`team-name ${homeFinal ? (homeWon ? 'winner' : 'loser') : ''}`}>
                      {shortName(g.away_team)}
                    </span>
                    <span className={`team-score ${hasScore ? (homeWon ? 'loser' : 'winner') : 'pending'}`}>
                      {hasScore ? awayScore : '—'}
                    </span>
                  </div>
                  <div className="team-row">
                    <span className={`team-name ${homeFinal ? (homeWon ? 'winner' : 'loser') : ''}`}>
                      {shortName(g.home_team)}
                    </span>
                    <span className={`team-score ${hasScore ? (homeWon ? 'winner' : 'loser') : 'pending'}`}>
                      {hasScore ? homeScore : '—'}
                    </span>
                  </div>
                </div>

                {/* Status + time */}
                <div className="status-col">
                  {status === 'final' && <span className="status-badge final">Final</span>}
                  {status === 'live'  && <span className="status-badge live">● Live</span>}
                  {status === 'pre'   && <span className="status-badge pre">Upcoming</span>}
                  <span className="game-time">
                    {status === 'live' ? liveLabel : formatTime(g.game_time)}
                  </span>
                </div>

                {/* Market + model lines */}
                <div className="lines-col">
                  <div className="lines-box market">
                    <div className="lines-header">Market Line</div>
                    {sp && (
                      <div className="lines-row">
                        <span className="lines-label">Spread</span>
                        <span className="lines-value">{spreadMarketLabel(sp)}</span>
                      </div>
                    )}
                    {tp && (
                      <div className="lines-row">
                        <span className="lines-label">Total</span>
                        <span className="lines-value">O/U {tp.line_total}</span>
                      </div>
                    )}
                  </div>
                  <div className="lines-box model">
                    <div className="lines-header">Model</div>
                    {sp && (
                      <div className="lines-row">
                        <span className="lines-label">Spread</span>
                        <span className="lines-value">{modelSpreadLabel(sp)}</span>
                      </div>
                    )}
                    {tp && (
                      <div className="lines-row">
                        <span className="lines-label">Total</span>
                        <span className="lines-value">{tp.pred_total?.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bet taken + result */}
                <div className="bet-col">
                  {sp && sp.bet_side_spread !== 'none' && (
                    <>
                      <span className="bet-chip spread">{spreadBetLabel(sp)}</span>
                      <span className={`edge-value ${isStrongEdge(sp.spread_edge) ? 'strong' : ''}`}>
                        Edge: {fmtEdge(sp.spread_edge)}
                      </span>
                    </>
                  )}
                  {tp && tp.bet_side_total !== 'none' && (
                    <>
                      <span className={`bet-chip ${tp.bet_side_total === 'over' ? 'total-over' : 'total-under'}`}>
                        {totalBetLabel(tp)}
                      </span>
                      <span className={`edge-value ${isStrongEdge(tp.total_edge) ? 'strong' : ''}`}>
                        Edge: {fmtEdge(tp.total_edge)}
                      </span>
                    </>
                  )}
                  {sp?.injury_notes && (
                    <span style={{ fontSize: 10, color: 'var(--accent-orange)', textAlign: 'right' }}>
                      🏥 {sp.injury_notes.split('|')[0]}
                    </span>
                  )}
                  <span className={`bet-result ${result || 'pending'}`}>
                    {result === 'win' ? '✓ WIN' : result === 'loss' ? '✗ LOSS' : result === 'push' ? '~ PUSH' : 'PENDING'}
                  </span>
                </div>

              </div>
            )
          })}
        </div>
      )}

      {/* ── Legend ── */}
      <div className="legend">
        {[
          { color: 'var(--accent-blue)',   label: 'Upcoming' },
          { color: 'var(--accent-green)',  label: 'Live' },
          { color: 'var(--text-muted)',    label: 'Final' },
          { color: 'var(--accent-purple)', label: 'Spread Bet' },
          { color: 'var(--accent-orange)', label: 'Over' },
          { color: 'var(--accent-blue)',   label: 'Under' },
        ].map(l => (
          <div key={l.label} className="legend-item">
            <div className="legend-dot" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
        <div className="legend-item" style={{ marginLeft: 'auto' }}>
          Paper money · $25/unit · Tournament model
        </div>
      </div>
    </>
  )
}
