'use client';

/**
 * Host-screen music and sound effects. Background music is one of the tracks
 * in public/music, looping for the whole session (lobby, games and results);
 * sound effects are synthesized with the Web Audio API. Browsers only allow
 * audio after a user gesture, so `unlock()` runs on the first click on the host page.
 */
import { MUSIC_TRACKS } from './types';

export type Sfx = 'join' | 'start' | 'submit' | 'reveal' | 'tick' | 'buzz' | 'boom' | 'win' | 'pop';

type Note = [freq: number, at: number, length: number];

const SFX: Record<Sfx, { wave: OscillatorType; notes: Note[]; gain: number }> = {
  join: { wave: 'triangle', notes: [[523, 0, 0.1], [784, 0.08, 0.16]], gain: 0.35 },
  start: { wave: 'square', notes: [[392, 0, 0.1], [523, 0.1, 0.1], [659, 0.2, 0.1], [784, 0.3, 0.25]], gain: 0.18 },
  submit: { wave: 'sine', notes: [[880, 0, 0.08]], gain: 0.25 },
  reveal: { wave: 'triangle', notes: [[330, 0, 0.12], [440, 0.1, 0.12], [660, 0.2, 0.3]], gain: 0.3 },
  tick: { wave: 'square', notes: [[1200, 0, 0.03]], gain: 0.08 },
  buzz: { wave: 'sawtooth', notes: [[220, 0, 0.25]], gain: 0.2 },
  boom: { wave: 'sawtooth', notes: [[110, 0, 0.4], [55, 0.05, 0.6]], gain: 0.35 },
  win: { wave: 'triangle', notes: [[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1047, 0.45, 0.5]], gain: 0.3 },
  pop: { wave: 'sine', notes: [[660, 0, 0.06], [990, 0.04, 0.06]], gain: 0.2 },
};

class HostAudio {
  private ctx: AudioContext | null = null;
  private sfx: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private track = 1;
  private unlocked = false;
  private musicVolume = 0.4;
  private sfxVolume = 0.7;

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.unlocked = true;
    this.syncMusic();
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyVolumes();
    this.syncMusic();
  }

  /** Switches the background track (1-based id from MUSIC_TRACKS). */
  setTrack(id: number): void {
    if (id === this.track && this.music) return;
    this.track = id;
    if (this.music) {
      this.music.pause();
      this.music = null;
    }
    this.syncMusic();
  }

  private applyVolumes(): void {
    if (this.ctx && this.sfx) this.sfx.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
    // Keep music under the sound effects and speech.
    if (this.music) this.music.volume = Math.min(1, this.musicVolume * 0.6);
  }

  private syncMusic(): void {
    if (typeof window === 'undefined' || !this.unlocked) return;
    if (this.musicVolume <= 0) {
      this.music?.pause();
      return;
    }
    if (!this.music) {
      const track = MUSIC_TRACKS.find((t) => t.id === this.track) ?? MUSIC_TRACKS[0];
      this.music = new Audio(track.src);
      this.music.loop = true;
      this.music.preload = 'auto';
    }
    this.applyVolumes();
    if (this.music.paused) void this.music.play().catch(() => undefined);
  }

  play(name: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.sfxVolume <= 0) return;
    const spec = SFX[name];
    const now = ctx.currentTime;
    for (const [freq, at, length] of spec.notes) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = spec.wave;
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0, now + at);
      env.gain.linearRampToValueAtTime(spec.gain, now + at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, now + at + length);
      osc.connect(env).connect(this.sfx);
      osc.start(now + at);
      osc.stop(now + at + length + 0.05);
    }
  }
}

export const hostAudio = new HostAudio();
