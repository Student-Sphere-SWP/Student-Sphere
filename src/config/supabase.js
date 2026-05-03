const { createClient } = require('@supabase/supabase-js');

// Service-role client — bypasses RLS, used server-side only
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: { persistSession: false }
  }
);

module.exports = supabase;

