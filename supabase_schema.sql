-- Run this in Supabase SQL editor

create table if not exists picks (
  id bigserial primary key,
  game_date date not null,
  game_time timestamptz,
  home_team text not null,
  away_team text not null,
  bet_type text not null,           -- 'spread' | 'total'
  bet_side_spread text,
  bet_side_total text,
  line_spread numeric,
  line_total numeric,
  pred_spread numeric,
  pred_total numeric,
  spread_edge numeric,
  total_edge numeric,
  confidence text,
  result text,                      -- 'win' | 'loss' | 'push' | 'pending' | null
  home_score integer,
  away_score integer,
  live_status text,
  injury_notes text,
  model_source text default 'tournament',
  created_at timestamptz default now(),
  unique (home_team, away_team, game_date, bet_type)
);

create table if not exists record (
  id integer primary key default 1,
  wins integer default 0,
  losses integer default 0,
  pushes integer default 0,
  units numeric default 0,
  updated_at timestamptz default now()
);

-- Enable public read access (picks are not sensitive)
alter table picks enable row level security;
alter table record enable row level security;

create policy "Public read picks" on picks for select using (true);
create policy "Public read record" on record for select using (true);

-- Service role key handles inserts/updates from the bot
