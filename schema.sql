-- ─── Shift Swap App — Supabase Schema ────────────────────────────────────────
-- Run this entire file in the Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- ─── Tables ───────────────────────────────────────────────────────────────────

-- Stores each user's display name (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores each user's individual shift slots
CREATE TABLE IF NOT EXISTS shifts (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  day        TEXT NOT NULL CHECK (day IN ('Monday','Tuesday','Wednesday','Thursday','Friday')),
  period     TEXT NOT NULL CHECK (period IN ('Morning','Evening')),
  time       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, day, period)           -- one shift per user per day+period
);

-- Stores swap requests posted between users
CREATE TABLE IF NOT EXISTS swap_requests (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  offer_day    TEXT NOT NULL,             -- the shift you're giving away
  offer_period TEXT NOT NULL,
  offer_time   TEXT NOT NULL,
  want_day     TEXT NOT NULL,             -- the shift you want in return
  want_period  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','cancelled')),
  acceptor_id  UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE swap_requests ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone can read, users can only write their own
CREATE POLICY "profiles_read"   ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Shifts: anyone can read, users can only write their own
CREATE POLICY "shifts_read"   ON shifts FOR SELECT USING (true);
CREATE POLICY "shifts_insert" ON shifts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shifts_update" ON shifts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "shifts_delete" ON shifts FOR DELETE USING (auth.uid() = user_id);

-- Swap requests: anyone can read open requests, only owner can insert/cancel
CREATE POLICY "requests_read"   ON swap_requests FOR SELECT USING (true);
CREATE POLICY "requests_insert" ON swap_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "requests_cancel" ON swap_requests FOR UPDATE USING (auth.uid() = requester_id);

-- ─── accept_swap Function ─────────────────────────────────────────────────────
-- Called when a user accepts someone else's swap request.
-- SECURITY DEFINER lets it update BOTH users' shifts (bypasses RLS for that).

CREATE OR REPLACE FUNCTION public.accept_swap(p_request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''          -- prevents schema injection attacks (Supabase requirement)
AS $$
DECLARE
  v_req           public.swap_requests%ROWTYPE;
  v_acceptor      UUID := auth.uid();
  v_acceptor_time TEXT;
BEGIN
  -- Lock the request row so two people can't accept simultaneously
  SELECT * INTO v_req
  FROM public.swap_requests
  WHERE id = p_request_id AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request no longer available';
  END IF;

  IF v_req.requester_id = v_acceptor THEN
    RAISE EXCEPTION 'You cannot accept your own swap request';
  END IF;

  -- Confirm acceptor actually has the shift being requested
  SELECT time INTO v_acceptor_time
  FROM public.shifts
  WHERE user_id = v_acceptor
    AND day = v_req.want_day
    AND period = v_req.want_period;

  IF v_acceptor_time IS NULL THEN
    RAISE EXCEPTION 'You no longer have the requested shift';
  END IF;

  -- Swap acceptor's shift → give them the offered shift
  DELETE FROM public.shifts
  WHERE user_id = v_acceptor AND day = v_req.want_day AND period = v_req.want_period;

  INSERT INTO public.shifts (user_id, day, period, time)
  VALUES (v_acceptor, v_req.offer_day, v_req.offer_period, v_req.offer_time);

  -- Swap requester's shift → give them the acceptor's former shift
  DELETE FROM public.shifts
  WHERE user_id = v_req.requester_id AND day = v_req.offer_day AND period = v_req.offer_period;

  INSERT INTO public.shifts (user_id, day, period, time)
  VALUES (v_req.requester_id, v_req.want_day, v_req.want_period, v_acceptor_time);

  -- Mark request as accepted
  UPDATE public.swap_requests
  SET status = 'accepted', acceptor_id = v_acceptor
  WHERE id = p_request_id;
END;
$$;

-- Allow logged-in users to call this function
GRANT EXECUTE ON FUNCTION public.accept_swap(UUID) TO authenticated;
