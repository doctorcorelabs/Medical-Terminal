import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hvhsoscduqektunuryky.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2aHNvc2NkdXFla3R1bnVyeWt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NTI1MTEsImV4cCI6MjA4ODQyODUxMX0.SqhqevIGMAoI9NQAS4UykEIycVqzoyV7HCfpTIjryN0';

export const supabase = createClient(supabaseUrl, supabaseKey);
