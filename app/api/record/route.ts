import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('record')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error) return NextResponse.json({ wins: 0, losses: 0, pushes: 0, units: 0 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') || ''
  if (authHeader !== `Bearer ${process.env.BOT_API_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const { error } = await supabase.from('record').upsert({ id: 1, ...body, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
