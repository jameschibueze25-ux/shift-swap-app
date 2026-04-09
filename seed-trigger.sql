-- Run this in Supabase SQL Editor
-- It creates a trigger that auto-creates a profile + default shifts
-- the moment any new user signs up — bypasses email confirmation issues.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Create profile using name passed from signup form (falls back to email)
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email)
  );

  -- Seed default Mon–Fri schedule
  INSERT INTO public.shifts (user_id, day, period, time) VALUES
    (NEW.id, 'Monday',    'Morning', '9am–5pm'),
    (NEW.id, 'Tuesday',   'Morning', '9am–5pm'),
    (NEW.id, 'Wednesday', 'Morning', '9am–5pm'),
    (NEW.id, 'Thursday',  'Evening', '2pm–10pm'),
    (NEW.id, 'Friday',    'Morning', '9am–5pm');

  RETURN NEW;
END;
$$;

-- Fire the function every time a new user is created
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
