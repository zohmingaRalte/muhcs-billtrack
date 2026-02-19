import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://zmejihypyagvgnwbtwup.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptZWppaHlweWFndmdud2J0d3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTc3MTcsImV4cCI6MjA4Njg3MzcxN30.IZCcKW2JvSNvpiaogVNF2PTxcmpD-xxMGgHVkBNO1Ug";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
