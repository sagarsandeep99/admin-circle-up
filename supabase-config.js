const SUPABASE_URL = 'https://gouqpxzehiuxzinvcavh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvdXFweHplaGl1eHppbnZjYXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTgxMTEsImV4cCI6MjA5NDA5NDExMX0.trhLEhq04vP3_-ekfWETyXWZmat3sLiVO750KUmJwhg';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
});