import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/picks?date=2026-03-12
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('picks')
    .select('*')
    .eq('game_date', date)
    .order('game_time', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/picks — called by the bot after each run
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.BOT_API_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const picks = body.picks as Record<string, unknown>[]

  if (!Array.isArray(picks) || picks.length === 0) {
    return NextResponse.json({ error: 'No picks provided' }, { status: 400 })
  }

  // Upsert — replace any existing picks for this game+date+type
  const { error } = await supabase
    .from('picks')
    .upsert(picks, { onConflict: 'home_team,away_team,game_date,bet_type' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: picks.length })
}
