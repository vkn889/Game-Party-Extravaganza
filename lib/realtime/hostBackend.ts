'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContentItem, ContentPacks, RoomSettings } from '@/lib/types';
import type { HostBackend, StoredPlayer } from './transport';

interface PlayerRow {
  id: string;
  name: string;
  color: string;
  token: string;
  is_vip: boolean | null;
  is_audience: boolean | null;
  score: number | null;
  games_won: number | null;
  joined_at: string;
}

const PAGE = 1000;

export function createHostBackend(supabase: SupabaseClient, roomId: string): HostBackend {
  return {
    async loadPlayers(): Promise<StoredPlayer[]> {
      const { data, error } = await supabase.rpc('host_room_players', { p_room_id: roomId });
      if (error) throw error;
      return ((data ?? []) as PlayerRow[]).map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        token: row.token,
        isVip: Boolean(row.is_vip),
        isAudience: Boolean(row.is_audience),
        score: row.score ?? 0,
        gamesWon: row.games_won ?? 0,
        joinedAt: row.joined_at,
        connected: false,
      }));
    },

    async deletePlayer(id) {
      const { error } = await supabase.from('players').delete().eq('id', id);
      if (error) throw error;
    },

    async updatePlayer(id, patch) {
      const { error } = await supabase.from('players').update(patch).eq('id', id);
      if (error) throw error;
    },

    async saveSnapshot({ snapshot, status, currentGame }) {
      const { error } = await supabase
        .from('rooms')
        .update({
          state_snapshot: snapshot,
          status,
          current_game: currentGame,
          last_activity: new Date().toISOString(),
        })
        .eq('id', roomId);
      if (error) throw error;
    },

    async saveSettings(settings: RoomSettings) {
      const { error } = await supabase.from('rooms').update({ settings }).eq('id', roomId);
      if (error) throw error;
    },

    async loadContent(packs, familyFriendly): Promise<ContentPacks> {
      const out: ContentPacks = Object.fromEntries(packs.map((p) => [p, [] as ContentItem[]]));
      for (let from = 0; ; from += PAGE) {
        let query = supabase
          .from('prompts')
          .select('game, text, answer, decoys')
          .in('game', packs)
          .order('id')
          .range(from, from + PAGE - 1);
        if (familyFriendly) query = query.eq('family_friendly', true);
        const { data, error } = await query;
        if (error) throw error;
        for (const row of data ?? []) {
          out[row.game]?.push({ text: row.text, answer: row.answer, decoys: row.decoys });
        }
        if (!data || data.length < PAGE) break;
      }
      return out;
    },
  };
}
