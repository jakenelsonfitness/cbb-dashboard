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
  result: 'win' | 'loss' | 'push' | 'pending' | null
  home_score: number | null
  away_score: number | null
  live_status: string | null
  injury_notes: string | null
}

interface Record {
  wins: number
  losses: number
  pushes: number
  units: number
}

interface GameGroup {
  home_team: string
  away_team: string
  game_time: string | null
  spread_pick: Pick | null
  total_pick: Pick | null
}

function formatTime(t: string | null): string {
  if (!t) return '—'
  try {
    const d = new Date(t)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
  } catch { return t }
}

function formatSpreadBet(pick: Pick): string {
  if (!pick.line_spread) return '—'
  const line = pick.line_spread
  if (pick.bet_side_spread === 'home') {
    return `${pick.home_team.split(' ').pop()} ${line > 0 ? '+' : ''}${line}`
  } else {
    const awayLine = -line
    return `${pick.away_team.split(' ').pop()} ${awayLine > 0 ? '+' : ''}${awayLine}`
  }
}

function formatTotalBet(pick: Pick): string {
  if (!pick.line_total) return '—'
  return `${pick.bet_side_total === 'over' ? 'Over' : 'Under'} ${pick.line_total}`
}

function ResultBadge({ result, liveStatus }: { result: string | null; liveStatus: string | null }) {
  if (liveStatus && liveStatus !== 'final' && liveStatus !== 'pre') {
    return <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-500/20 text-yellow-400 animate-pulse">LIVE</span>
  }
  if (result === 'win') return <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-500/20 text-green-400">WIN</span>
  if (result === 'loss') return <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400">LOSS</span>
  if (result === 'push') return <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-500/20 text-gray-400">PUSH</span>
  return <span className="px-2 py-0.5 rounded text-xs font-bold bg-white/10 text-gray-400">—</span>
}

function ConfidenceDot({ level }: { level: string }) {
  const colors: Record<string, string> = {
    Elite: 'bg-purple-400',
    Strong: 'bg-blue-400',
    Moderate: 'bg-sky-400',
    Lean: 'bg-gray-400',
    Tournament: 'bg-orange-400',
  }
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[level] || 'bg-gray-500'} mr-1`} />
}

export default function Dashboard() {
  const [games, setGames] = useState<GameGroup[]>([])
  const [record, setRecord] = useState<Record>({ wins: 0, losses: 0, pushes: 0, units: 0 })
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchPicks = useCallback(async () => {
    try {
      const res = await fetch(`/api/picks?date=${date}`)
      const picks: Pick[] = await res.json()

      // Group by game
      const grouped: Record<string, GameGroup> = {}
      for (const p of picks) {
        const key = `${p.away_team}@${p.home_team}`
        if (!grouped[key]) {
          grouped[key] = { home_team: p.home_team, away_team: p.away_team, game_time: p.game_time, spread_pick: null, total_pick: null }
        }
        if (p.bet_type === 'spread') grouped[key].spread_pick = p
        if (p.bet_type === 'total') grouped[key].total_pick = p
      }

      const sorted = Object.values(grouped).sort((a, b) => {
        if (!a.game_time) return 1
        if (!b.game_time) return -1
        return new Date(a.game_time).getTime() - new Date(b.game_time).getTime()
      })

      setGames(sorted)
      setLastUpdated(new Date())
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [date])

  const fetchRecord = useCallback(async () => {
    try {
      const res = await fetch('/api/record')
      const data = await res.json()
      setRecord(data)
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => {
    fetchPicks()
    fetchRecord()
    const interval = setInterval(() => { fetchPicks(); fetchRecord() }, 60000) // refresh every 60s
    return () => clearInterval(interval)
  }, [fetchPicks, fetchRecord])

  const totalPicks = games.length
  const wins = games.filter(g => g.spread_pick?.result === 'win' || g.total_pick?.result === 'win').length
  const losses = games.filter(g => g.spread_pick?.result === 'loss' || g.total_pick?.result === 'loss').length

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold tracking-tight">🏀 CBB Picks</h1>
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setLoading(true) }}
            className="bg-white/10 text-white text-sm rounded px-2 py-1 border border-white/20"
          />
        </div>
        {lastUpdated && (
          <p className="text-xs text-gray-500">Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
        )}
      </div>

      {/* Record bar */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {[
          { label: 'Record', value: `${record.wins}-${record.losses}-${record.pushes}` },
          { label: 'Units', value: `${record.units >= 0 ? '+' : ''}${record.units?.toFixed(1)}u` },
          { label: "Today W", value: String(wins) },
          { label: "Today L", value: String(losses) },
        ].map(s => (
          <div key={s.label} className="bg-white/5 rounded-xl p-3 text-center">
            <div className="text-lg font-bold">{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Picks list */}
      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading picks…</div>
      ) : games.length === 0 ? (
        <div className="text-center text-gray-500 py-16">No picks for {date}</div>
      ) : (
        <div className="space-y-3">
          {games.map((g, i) => {
            const sp = g.spread_pick
            const tp = g.total_pick
            const liveStatus = sp?.live_status || tp?.live_status
            const homeScore = sp?.home_score ?? tp?.home_score
            const awayScore = sp?.away_score ?? tp?.away_score
            const hasScore = homeScore !== null && awayScore !== null
            const isLive = liveStatus && liveStatus !== 'final' && liveStatus !== 'pre'
            const isFinal = liveStatus === 'final'

            return (
              <div key={i} className={`rounded-2xl p-4 border ${isLive ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-white/10 bg-white/5'}`}>
                {/* Game header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold">
                      {g.away_team.replace(/ (Wildcats|Bulldogs|Tigers|Bears|Cardinals|Eagles|Hawks|Wolves|Huskies|Cougars|Trojans|Bruins|Bobcats|Falcons|Panthers|Rams|Owls|Bison|Lions|Vikings|Knights|Ramblers|Flyers|Friars|Hoyas|Quakers|Crimson|Tar Heels|Blue Devils|Demon Deacons|Orange|Bonnies|Billikens|Redbirds|Musketeers|Bearcats|Cyclones|Jayhawks|Longhorns|Sooners|Red Raiders|Cowboys|Mountaineers|Cornhuskers|Huskers|Badgers|Illini|Hawkeyes|Gophers|Nittany Lions|Spartans|Wolverines|Buckeyes|Hoosiers|Boilermakers|Golden Gophers|Terrapins|Scarlet Knights|Blue Hens|Retrievers|Flames|Dukes|Monarchs|Seahawks|Governors|Thundering Herd|Golden Eagles|Colonels|Hilltoppers|Toppers|Racers|Panthers|Colonials|Patriors|Explorers|Dragons|Phoenixes|Pioneers|Greyhounds|Retrievers|Matadors|Antelopes|Aggies|Lobos|Aztecs|Tritons|Gauchos|Roadrunners|49ers|Miners|Mustangs|Mean Green|Colonels|RedHawks|Redhawks|Bobcats|Rockets|Flashes|Zips|Cardinals|Penguins|Golden Flashes|Falcons|Bald Eagles)$/i, '').trim()}
                    </div>
                    <div className="text-xs text-gray-500">
                      @ {g.home_team.replace(/ (Wildcats|Bulldogs|Tigers|Bears|Cardinals|Eagles|Hawks|Wolves|Huskies|Cougars|Trojans|Bruins|Bobcats|Falcons|Panthers|Rams|Owls|Bison|Lions|Vikings|Knights|Ramblers|Flyers|Friars|Hoyas|Quakers|Crimson|Tar Heels|Blue Devils|Demon Deacons|Orange|Bonnies|Billikens|Redbirds|Musketeers|Bearcats|Cyclones|Jayhawks|Longhorns|Sooners|Red Raiders|Cowboys|Mountaineers|Cornhuskers|Huskers|Badgers|Illini|Hawkeyes|Gophers|Nittany Lions|Spartans|Wolverines|Buckeyes|Hoosiers|Boilermakers|Golden Gophers|Terrapins|Scarlet Knights|Blue Hens|Retrievers|Flames|Dukes|Monarchs|Seahawks|Governors|Thundering Herd|Golden Eagles|Colonels|Hilltoppers|Toppers|Racers|Panthers|Colonials|Patriors|Explorers|Dragons|Phoenixes|Pioneers|Greyhounds|Retrievers|Matadors|Antelopes|Aggies|Lobos|Aztecs|Tritons|Gauchos|Roadrunners|49ers|Miners|Mustangs|Mean Green|Colonels|RedHawks|Redhawks|Bobcats|Rockets|Flashes|Zips|Cardinals|Penguins|Golden Flashes|Falcons|Bald Eagles)$/i, '').trim()}
                    </div>
                  </div>
                  <div className="text-right">
                    {hasScore ? (
                      <div className="text-right">
                        <div className={`text-lg font-bold ${isLive ? 'text-yellow-400' : isFinal ? 'text-white' : 'text-gray-300'}`}>
                          {awayScore} – {homeScore}
                        </div>
                        <div className="text-xs text-gray-500">{isFinal ? 'Final' : liveStatus || ''}</div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-400">{formatTime(g.game_time)}</div>
                    )}
                  </div>
                </div>

                {/* Picks */}
                <div className="space-y-2">
                  {sp && sp.bet_side_spread !== 'none' && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ConfidenceDot level={sp.confidence} />
                        <div>
                          <span className="text-sm font-medium">{formatSpreadBet(sp)}</span>
                          {sp.spread_edge !== null && (
                            <span className="ml-2 text-xs text-gray-500">edge {sp.spread_edge > 0 ? '+' : ''}{sp.spread_edge?.toFixed(1)}</span>
                          )}
                        </div>
                      </div>
                      <ResultBadge result={sp.result} liveStatus={sp.live_status} />
                    </div>
                  )}
                  {tp && tp.bet_side_total !== 'none' && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ConfidenceDot level={tp.confidence} />
                        <div>
                          <span className="text-sm font-medium">{formatTotalBet(tp)}</span>
                          {tp.total_edge !== null && (
                            <span className="ml-2 text-xs text-gray-500">edge {tp.total_edge > 0 ? '+' : ''}{tp.total_edge?.toFixed(1)}</span>
                          )}
                        </div>
                      </div>
                      <ResultBadge result={tp.result} liveStatus={tp.live_status} />
                    </div>
                  )}
                  {sp?.injury_notes && (
                    <div className="text-xs text-amber-400/80 mt-1">🏥 {sp.injury_notes}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-center text-xs text-gray-600 mt-8">Paper money · $25/unit · Tournament model</p>
    </div>
  )
}
