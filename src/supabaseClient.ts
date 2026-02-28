import { createClient } from '@supabase/supabase-js';

// Reemplaza estos valores con tus datos de Supabase
const supabaseUrl = 'https://zjemficueppkbqydabop.supabase.co'; // Tu URL real
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqZW1maWN1ZXBwa2JxeWRhYm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMzM3MzMsImV4cCI6MjA4NzgwOTczM30.4C8xwNOl65ucr-DdXnoFAzkMsPGhHwNDS8q43wOT7NI'; // Pega tu llave anon public aquí

export const supabase = createClient(supabaseUrl, supabaseKey);