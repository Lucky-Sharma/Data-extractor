import { createClient } from '@supabase/supabase-js'

export function createSupabaseClient() {
        return createClient(
            "https://gkuxxzfzjkzcwabarsmu.supabase.co",
            process.env.SUPABASE_API_KEY!
        )
    
}



