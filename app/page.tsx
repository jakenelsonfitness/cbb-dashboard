'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

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

interface LiveScore {
  home_score: number | null
  away_score: number | null
  live_status: string   // 'pre' | 'H1 12:34' | 'H2 5:00' | 'OT 2:00' | 'final'
  game_time: string | null
}

// ── ESPN live score fetcher ───────────────────────────────────────────────────

async function fetchESPNScores(dateStr: string): Promise<Map<string, LiveScore>> {
  const d = dateStr.replace(/-/g, '')
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${d}&limit=300&groups=50`
  const map = new Map<string, LiveScore>()
  try {
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    for (const event of data.events ?? []) {
      for (const comp of event.competitions ?? []) {
        const statusType = comp.status?.type?.name?.toLowerCase() ?? ''
        const period = comp.status?.period ?? 0
        const clock  = comp.status?.displayClock ?? ''
        const commence: string = comp.date ?? ''

        let liveStatus = 'pre'
        if (statusType.includes('final') || statusType.includes('post') || statusType === 'post') {
          liveStatus = 'final'
        } else if (statusType.includes('progress') || statusType.includes('halftime') || statusType.includes('end_period') || statusType === 'in') {
          liveStatus = period <= 2 ? `H${period} ${clock}` : `OT ${clock}`
        }

        const home = comp.competitors?.find((c: {homeAway: string}) => c.homeAway === 'home')
        const away = comp.competitors?.find((c: {homeAway: string}) => c.homeAway === 'away')
        if (!home || !away) continue

        const score: LiveScore = {
          home_score: parseInt(home.score ?? '0') || 0,
          away_score: parseInt(away.score ?? '0') || 0,
          live_status: liveStatus,
          game_time: commence || null,
        }

        // Index by both teams (lowercase, first 10 chars) for fuzzy matching
        const hk = home.team.displayName.toLowerCase()
        const ak = away.team.displayName.toLowerCase()
        map.set(`${ak}||${hk}`, score)
        map.set(`${hk}||${ak}`, score) // reverse index too
      }
    }
  } catch { /* ESPN fetch failed silently */ }
  return map
}

function fuzzyScore(awayTeam: string, homeTeam: string, scores: Map<string, LiveScore>): LiveScore | null {
  const ak = awayTeam.toLowerCase()
  const hk = homeTeam.toLowerCase()
  // Exact
  if (scores.has(`${ak}||${hk}`)) return scores.get(`${ak}||${hk}`)!
  // Partial — find best overlap
  for (const [key, val] of scores.entries()) {
    const [ka, kh] = key.split('||')
    if ((ak.includes(ka.slice(0, 8)) || ka.includes(ak.slice(0, 8))) &&
        (hk.includes(kh.slice(0, 8)) || kh.includes(hk.slice(0, 8)))) {
      return val
    }
  }
  return null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function schoolName(full: string): string {
  // Return just the school portion (drop mascot = last word if >1 word)
  const words = full.trim().split(' ')
  if (words.length <= 2) return full  // e.g. "Virginia" or "NC State" — keep as-is
  return words.slice(0, -1).join(' ') // drop last word (mascot)
}

function abbr(full: string): string {
  // Short label for lines boxes — 4–6 chars
  const LOOKUP: Record<string, string> = {
    'massachusetts': 'UMASS', 'miami (oh)': 'MIA(OH)', 'miami': 'MIAMI',
    'st. john': 'STJ', "st. john's": 'STJ', 'providence': 'PROV',
    'virginia': 'UVA', 'nc state': 'NCST', 'iowa state': 'ISU',
    'texas tech': 'TTU', 'wisconsin': 'WIS', 'louisville': 'LOU',
    'auburn': 'AUB', 'tennessee': 'TENN', 'arizona': 'ARIZ', 'ucf': 'UCF',
    'duke': 'DUKE', 'kentucky': 'UK', 'kansas': 'KU', 'houston': 'HOU',
    'auburn tigers': 'AUB', 'gonzaga': 'GONZ', 'baylor': 'BAY',
    'purdue': 'PUR', 'alabama': 'ALA', 'arkansas': 'ARK',
    'florida': 'FLA', 'michigan': 'MICH', 'michigan state': 'MSU',
    'ohio state': 'OSU', 'indiana': 'IND', 'illinois': 'ILL',
    'northwestern': 'NW', 'penn state': 'PSU', 'maryland': 'UMD',
    'connecticut': 'UCONN', 'butler': 'BUT', 'creighton': 'CREI',
    'villanova': 'NOVA', 'xavier': 'XAV', 'marquette': 'MKE',
    'georgetown': 'GU', 'seton hall': 'SHU', 'depaul': 'DEP',
    'notre dame': 'ND', 'louisiana': 'ULL', 'memphis': 'MEM',
    'wichita state': 'WSU', 'cincinnati': 'CIN', 'tulsa': 'TUL',
    'south carolina': 'USC', 'mississippi state': 'MSST', 'ole miss': 'MISS',
    'georgia': 'UGA', 'vanderbilt': 'VAN', 'lsu': 'LSU',
    'texas a&m': 'TAMU', 'oklahoma': 'OU', 'oklahoma state': 'OKST',
    'west virginia': 'WVU', 'tcu': 'TCU', 'byu': 'BYU',
    'colorado': 'COLO', 'utah': 'UTAH', 'oregon': 'ORE',
    'washington': 'WASH', 'ucla': 'UCLA', 'usc': 'USC',
    'stanford': 'STAN', 'california': 'CAL', 'san diego state': 'SDSU',
  }
  const key = full.trim().toLowerCase()
  if (LOOKUP[key]) return LOOKUP[key]
  // Fallback: first word up to 5 chars
  const words = full.trim().split(' ')
  return words[0].slice(0, 5).toUpperCase()
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2
}

function fmtLine(n: number | null | undefined): string {
  if (n == null) return '—'
  const r = roundHalf(n)
  return r % 1 === 0 ? r.toFixed(1) : String(r)
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
    })
  } catch { return '—' }
}


function gameStatus(g: GameGroup): 'pre' | 'live' | 'final' {
  const s = g.spread?.live_status || g.total?.live_status || ''
  if (s === 'final') return 'final'
  if (s && s !== 'pre' && s !== '') return 'live'
  return 'pre'
}

function spreadBetLabel(p: Pick): string {
  if (!p.line_spread) return '—'
  const line = roundHalf(p.line_spread)
  if (p.bet_side_spread === 'home') {
    return `${schoolName(p.home_team)} ${line >= 0 ? '+' : ''}${fmtLine(line)}`
  }
  const awayLine = -line
  return `${schoolName(p.away_team)} ${awayLine >= 0 ? '+' : ''}${fmtLine(awayLine)}`
}

function totalBetLabel(p: Pick): string {
  if (!p.line_total) return '—'
  return `${p.bet_side_total === 'over' ? 'Over' : 'Under'} ${fmtLine(p.line_total)}`
}

function spreadMarketLabel(p: Pick): string {
  if (!p.line_spread) return '—'
  const line = roundHalf(p.line_spread)
  if (line < 0) return `${abbr(p.home_team)} ${fmtLine(line)}`
  if (line > 0) return `${abbr(p.away_team)} -${fmtLine(line)}`
  return 'PK'
}

function modelSpreadLabel(p: Pick): string {
  if (p.pred_spread == null) return '—'
  const ps = p.pred_spread  // already rounded to .5 by _r5()
  if (ps > 0) return `${abbr(p.home_team)} -${Math.abs(ps).toFixed(1)}`
  if (ps < 0) return `${abbr(p.away_team)} -${Math.abs(ps).toFixed(1)}`
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

function gradeSpread(homeScore: number, awayScore: number, lineFav: number, side: string): 'win' | 'loss' | 'push' {
  // lineFav: negative = home favored (e.g. -7.5), positive = away favored
  const actual = homeScore - awayScore          // positive = home won
  const covered = actual + lineFav              // > 0 means home covered
  if (covered === 0) return 'push'
  if (side === 'home') return covered > 0 ? 'win' : 'loss'
  return covered < 0 ? 'win' : 'loss'           // side === 'away'
}

function gradeTotal(homeScore: number, awayScore: number, line: number, side: string): 'win' | 'loss' | 'push' {
  const actual = homeScore + awayScore
  if (actual === line) return 'push'
  if (side === 'over')  return actual > line ? 'win' : 'loss'
  return actual < line ? 'win' : 'loss'
}

function hitRate(wins: number, losses: number): string {
  const total = wins + losses
  if (total === 0) return '0.0%'
  return `${((wins / total) * 100).toFixed(1)}%`
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [games, setGames] = useState<GameGroup[]>([])
  const [liveScores, setLiveScores] = useState<Map<string, LiveScore>>(new Map())
  const [record, setRecord] = useState<BotRecord>({ wins: 0, losses: 0, pushes: 0, units: 0 })
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [scoresAt, setScoresAt] = useState<Date | null>(null)
  const gamesRef = useRef<GameGroup[]>([])

  // Fetch picks + record from Supabase (every 5 min is fine — picks don't change often)
  const fetchPicks = useCallback(async () => {
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

      gamesRef.current = sorted
      setGames(sorted)
      setRecord(rec)
      setUpdatedAt(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [date])

  // Fetch live scores directly from ESPN every 2 minutes
  const fetchScores = useCallback(async () => {
    const scores = await fetchESPNScores(date)
    setLiveScores(scores)
    setScoresAt(new Date())
  }, [date])

  useEffect(() => {
    setLoading(true)
    fetchPicks()
    fetchScores()
    const picksInterval  = setInterval(fetchPicks,  5 * 60 * 1000)  // every 5 min
    const scoresInterval = setInterval(fetchScores, 2 * 60 * 1000)  // every 2 min
    return () => { clearInterval(picksInterval); clearInterval(scoresInterval) }
  }, [fetchPicks, fetchScores])

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })

  // Merge ESPN live scores into games, then sort by tipoff time
  const gamesWithScores = games
    .map(g => {
      const espn = fuzzyScore(g.away_team, g.home_team, liveScores)
      if (!espn) return g
      const gt = espn.game_time ?? g.game_time
      const mergedSpread = g.spread ? { ...g.spread, home_score: espn.home_score, away_score: espn.away_score, live_status: espn.live_status, game_time: gt } : null
      const mergedTotal  = g.total  ? { ...g.total,  home_score: espn.home_score, away_score: espn.away_score, live_status: espn.live_status, game_time: gt } : null
      return { ...g, game_time: gt, spread: mergedSpread, total: mergedTotal }
    })
    .sort((a, b) => {
      if (!a.game_time) return 1
      if (!b.game_time) return -1
      return new Date(a.game_time).getTime() - new Date(b.game_time).getTime()
    })

  // Compute today's W/L/units fully client-side from ESPN grades
  let todayWins = 0, todayLosses = 0, todayPushes = 0, todayUnits = 0
  for (const g of gamesWithScores) {
    const status = gameStatus(g)
    const hs = g.spread?.home_score ?? g.total?.home_score
    const as_ = g.spread?.away_score ?? g.total?.away_score
    if (status !== 'final' || hs == null || as_ == null) continue

    const sp = g.spread
    const tp = g.total

    if (sp && sp.bet_side_spread !== 'none' && sp.line_spread != null) {
      const gr = gradeSpread(hs, as_, roundHalf(sp.line_spread), sp.bet_side_spread)
      if (gr === 'win')  { todayWins++;   todayUnits += 1 }
      if (gr === 'loss') { todayLosses++; todayUnits -= 1 }
      if (gr === 'push')   todayPushes++
    }
    if (tp && tp.bet_side_total !== 'none' && tp.line_total != null) {
      const gr = gradeTotal(hs, as_, roundHalf(tp.line_total), tp.bet_side_total)
      if (gr === 'win')  { todayWins++;   todayUnits += 1 }
      if (gr === 'loss') { todayLosses++; todayUnits -= 1 }
      if (gr === 'push')   todayPushes++
    }
  }

  return (
    <>
      {/* ── Header ── */}
      <div className="header">
        <div className="header-left">
          <span className="logo">🏀</span>
          <h1>CBB Picks</h1>
        </div>
        <div className="header-right">
          {scoresAt && (
            <span className="updated">
              Scores {scoresAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
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
          <div className="stat-label">Today&apos;s Record</div>
          <div className="stat-value">{todayWins}-{todayLosses}{todayPushes > 0 ? `-${todayPushes}` : ''}</div>
          <div className="stat-sub">{hitRate(todayWins, todayLosses)} hit rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Today P&amp;L</div>
          <div className={`stat-value ${todayUnits >= 0 ? 'positive' : 'negative'}`}>
            {todayUnits >= 0 ? '+' : ''}{todayUnits.toFixed(1)}u
          </div>
          <div className="stat-sub">${(todayUnits * 25).toFixed(0)} at $25/u</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Today W</div>
          <div className="stat-value" style={{ color: todayWins > 0 ? 'var(--accent-green)' : undefined }}>{todayWins}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Today L</div>
          <div className="stat-value" style={{ color: todayLosses > 0 ? 'var(--accent-red)' : undefined }}>{todayLosses}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Games</div>
          <div className="stat-value">{gamesWithScores.length}</div>
          <div className="stat-sub">{gamesWithScores.filter(g => gameStatus(g) === 'final').length} final</div>
        </div>
      </div>

      {/* ── Game cards ── */}
      {loading ? (
        <div className="loading">Loading picks…</div>
      ) : gamesWithScores.length === 0 ? (
        <div className="loading">No picks for {displayDate}</div>
      ) : (
        <div className="games-grid">
          {gamesWithScores.map((g, i) => {
            const sp = g.spread
            const tp = g.total
            const status = gameStatus(g)
            const liveLabel = sp?.live_status || tp?.live_status || ''
            const hasScore = (sp?.home_score ?? tp?.home_score) != null
            const homeScore = sp?.home_score ?? tp?.home_score
            const awayScore = sp?.away_score ?? tp?.away_score
            const homeFinal = status === 'final' && hasScore
            const homeWon = homeFinal && (homeScore ?? 0) > (awayScore ?? 0)

            return (
              <div key={i} className={`game-card status-${status}`}>

                {/* Teams + score */}
                <div className="teams-col">
                  <div className="team-row">
                    <span className={`team-name ${homeFinal ? (homeWon ? 'loser' : 'winner') : ''}`}>
                      {g.away_team}
                    </span>
                    <span className={`team-score ${hasScore ? (homeWon ? 'loser' : 'winner') : 'pending'}`}>
                      {hasScore ? awayScore : '—'}
                    </span>
                  </div>
                  <div className="team-row">
                    <span className={`team-name ${homeFinal ? (homeWon ? 'winner' : 'loser') : ''}`}>
                      {g.home_team}
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
                        <span className="lines-value">O/U {fmtLine(tp.line_total)}</span>
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
                  {sp && sp.bet_side_spread !== 'none' && (() => {
                    const grade = (status === 'final' && homeScore != null && awayScore != null && sp.line_spread != null && sp.bet_side_spread !== 'none')
                      ? gradeSpread(homeScore, awayScore, roundHalf(sp.line_spread), sp.bet_side_spread)
                      : null
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="bet-chip spread">{spreadBetLabel(sp)}</span>
                        {grade && (
                          <span className={`bet-result ${grade}`}>
                            {grade === 'win' ? '✓ WIN' : grade === 'loss' ? '✗ LOSS' : '~ PUSH'}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                  {tp && tp.bet_side_total !== 'none' && (() => {
                    const grade = (status === 'final' && homeScore != null && awayScore != null && tp.line_total != null && tp.bet_side_total !== 'none')
                      ? gradeTotal(homeScore, awayScore, roundHalf(tp.line_total), tp.bet_side_total)
                      : null
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`bet-chip ${tp.bet_side_total === 'over' ? 'total-over' : 'total-under'}`}>
                          {totalBetLabel(tp)}
                        </span>
                        {grade && (
                          <span className={`bet-result ${grade}`}>
                            {grade === 'win' ? '✓ WIN' : grade === 'loss' ? '✗ LOSS' : '~ PUSH'}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                  {sp?.injury_notes && (
                    <span style={{ fontSize: 10, color: 'var(--accent-orange)', textAlign: 'right' }}>
                      🏥 {sp.injury_notes.split('|')[0]}
                    </span>
                  )}
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
