import { createClient } from '@supabase/supabase-js'
import { mapProfileBanFields } from './userBan'

// Vite exposes env vars with VITE_ prefix via import.meta.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase environment variables are missing. Create a .env file from .env.example')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Helper to get current user
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Helper to get user profile (role etc)
export const getUserProfile = async (userId) => {
  if (!userId) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) {
    console.error('Error fetching profile:', error)
    return null
  }
  return data
}

/** Build app user object from Supabase auth user + profiles row */
export const resolveUserData = async (authUser, { createIfMissing = false } = {}) => {
  if (!authUser?.id) return null

  let profile = await getUserProfile(authUser.id)

  if (!profile && createIfMissing) {
    const { data: newProfile, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: authUser.id,
        role: 'user',
        balance: 0,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to create profile:', insertError)
    } else {
      profile = newProfile
    }
  }

  if (!profile) {
    // Transient profile fetch failure — caller should keep existing user state.
    return null
  }

  return {
    id: authUser.id,
    email: authUser.email,
    username: profile.username || '',
    username_changed_at: profile.username_changed_at || null,
    name: profile.name || profile.username || authUser.email?.split('@')[0] || 'User',
    role: profile.role || 'user',
    balance: profile.balance ?? 0,
    avatar_url: profile.avatar_url || '',
    bio: profile.bio || '',
    phone: profile.phone || '',
    country: profile.country || '',
    favorite_game: profile.favorite_game || '',
    discord_username: profile.discord_username || '',
    default_player_uid: profile.default_player_uid || '',
    gender: profile.gender || null,
    date_of_birth: profile.date_of_birth || null,
    game_player_uids: profile.game_player_uids && typeof profile.game_player_uids === 'object'
      ? profile.game_player_uids
      : {},
    ...mapProfileBanFields(profile),
  }
}
