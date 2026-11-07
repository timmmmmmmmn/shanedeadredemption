// alle geluid wordt live gemaakt met WebAudio: schoten, explosies, Dead Eye-hartslag en western-muziek
let ctx = null, master, comp, sfxBus, musicBus, noiseBuf;
export const vol = { sfx: 0.8, music: 0.5 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.connect(ctx.destination);
  comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  comp.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(comp);
  musicBus = ctx.createGain(); musicBus.gain.value = vol.music; musicBus.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setVolumes() {
  if (!ctx) return;
  sfxBus.gain.value = vol.sfx; musicBus.gain.value = vol.music;
}
export function setSlow(on) {
  // Dead Eye: alles klinkt dof
  if (!ctx) return;
  lowpass(on);
}
let lp = null;
function lowpass(on) {
  if (!lp) {
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000;
    sfxBus.disconnect(); sfxBus.connect(lp); lp.connect(comp);
  }
  lp.frequency.setTargetAtTime(on ? 900 : 20000, ctx.currentTime, 0.08);
}

function noise(t, dur, { type = 'bandpass', f = 1000, q = 1, g = 1, attack = 0.001, decay = dur, fEnd, pan = 0, dest } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + attack);
  gn.gain.exponentialRampToValueAtTime(0.001, t + decay);
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  s.connect(fl); fl.connect(gn); gn.connect(p); p.connect(dest || sfxBus);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(t, dur, { f = 440, fEnd, type = 'sine', g = 0.5, attack = 0.005, pan = 0, dest } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + attack);
  gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  o.connect(gn); gn.connect(p); p.connect(dest || sfxBus);
  o.start(t); o.stop(t + dur + 0.05);
}

// v = volume 0..1 (afstand), pan -1..1
export function sfx(name, v = 1, pan = 0) {
  if (!ctx || v < 0.02) return;
  const t = ctx.currentTime;
  pan = Math.max(-1, Math.min(1, pan));
  switch (name) {
    case 'revolver':
      noise(t, 0.35, { type: 'lowpass', f: 5000, fEnd: 400, g: 1.1 * v, decay: 0.3, pan });
      noise(t, 0.08, { type: 'highpass', f: 2500, g: 0.6 * v, decay: 0.06, pan });
      tone(t, 0.18, { f: 140, fEnd: 45, g: 0.9 * v, pan });
      noise(t + 0.06, 0.9, { type: 'bandpass', f: 700, q: 0.6, g: 0.18 * v, decay: 0.9, pan }); // galm
      break;
    case 'rifle':
      noise(t, 0.5, { type: 'lowpass', f: 7000, fEnd: 300, g: 1.3 * v, decay: 0.45, pan });
      noise(t, 0.06, { type: 'highpass', f: 3500, g: 0.8 * v, decay: 0.05, pan });
      tone(t, 0.25, { f: 110, fEnd: 35, g: 1.0 * v, pan });
      noise(t + 0.1, 1.3, { type: 'bandpass', f: 500, q: 0.5, g: 0.22 * v, decay: 1.3, pan });
      break;
    case 'shotgun':
      noise(t, 0.6, { type: 'lowpass', f: 3000, fEnd: 150, g: 1.5 * v, decay: 0.55, pan });
      tone(t, 0.3, { f: 90, fEnd: 30, g: 1.2 * v, pan });
      noise(t + 0.08, 1.2, { type: 'bandpass', f: 350, q: 0.5, g: 0.25 * v, decay: 1.2, pan });
      break;
    case 'enemyShot':
      noise(t, 0.3, { type: 'lowpass', f: 3500, fEnd: 300, g: 0.8 * v, decay: 0.28, pan });
      tone(t, 0.12, { f: 120, fEnd: 50, g: 0.5 * v, pan });
      break;
    case 'whizz': tone(t, 0.15, { f: 2400, fEnd: 700, type: 'sawtooth', g: 0.06 * v, pan }); noise(t, 0.12, { type: 'bandpass', f: 3000, q: 4, g: 0.2 * v, pan }); break;
    case 'ricochet': tone(t, 0.35, { f: 3200, fEnd: 1200, type: 'triangle', g: 0.12 * v, pan }); break;
    case 'impact': noise(t, 0.08, { type: 'bandpass', f: 1800, q: 2, g: 0.4 * v, pan }); break;
    case 'flesh': noise(t, 0.1, { type: 'lowpass', f: 900, g: 0.7 * v, pan }); tone(t, 0.08, { f: 200, fEnd: 90, g: 0.3 * v, pan }); break;
    case 'headshot': tone(t, 0.1, { f: 1400, fEnd: 900, type: 'square', g: 0.12 * v }); noise(t, 0.1, { type: 'lowpass', f: 1200, g: 0.7 * v, pan }); break;
    case 'hitmark': tone(t, 0.05, { f: 1800, type: 'square', g: 0.05 * v }); break;
    case 'hurt': noise(t, 0.2, { type: 'lowpass', f: 600, g: 0.8 * v }); tone(t, 0.25, { f: 160, fEnd: 70, g: 0.5 * v }); break;
    case 'click': tone(t, 0.03, { f: 2200, type: 'square', g: 0.12 * v }); break;
    case 'reload':
      for (let i = 0; i < 3; i++) tone(t + i * 0.18, 0.04, { f: 1600 + i * 200, type: 'square', g: 0.08 * v });
      break;
    case 'lever': tone(t, 0.05, { f: 900, type: 'square', g: 0.12 * v }); tone(t + 0.12, 0.05, { f: 1300, type: 'square', g: 0.12 * v }); break;
    case 'cock': tone(t, 0.04, { f: 1500, type: 'square', g: 0.1 * v }); break;
    case 'knife': noise(t, 0.18, { type: 'bandpass', f: 4000, fEnd: 1500, q: 3, g: 0.5 * v, pan }); break;
    case 'stab': noise(t, 0.15, { type: 'lowpass', f: 700, g: 0.9 * v, pan }); break;
    case 'throw': noise(t, 0.25, { type: 'bandpass', f: 800, fEnd: 2000, q: 2, g: 0.3 * v }); break;
    case 'fuse': noise(t, 0.4, { type: 'highpass', f: 5000, g: 0.12 * v, pan }); break;
    case 'explosion':
      noise(t, 2.2, { type: 'lowpass', f: 1800, fEnd: 60, g: 1.8 * v, decay: 2.0, pan });
      tone(t, 0.8, { f: 70, fEnd: 22, g: 1.4 * v, pan });
      noise(t, 0.15, { type: 'highpass', f: 2000, g: 0.7 * v, decay: 0.12, pan });
      break;
    case 'bell': for (const f of [880, 1320, 2200]) tone(t, 2.5, { f, type: 'sine', g: 0.25 * v }); break;
    case 'heart': tone(t, 0.12, { f: 60, fEnd: 40, g: 0.9 * v }); tone(t + 0.18, 0.1, { f: 55, fEnd: 38, g: 0.6 * v }); break;
    case 'deadeyeOn': tone(t, 0.6, { f: 300, fEnd: 90, type: 'sawtooth', g: 0.15 * v }); noise(t, 0.5, { type: 'lowpass', f: 800, fEnd: 100, g: 0.4 * v }); break;
    case 'deadeyeOff': tone(t, 0.4, { f: 90, fEnd: 300, type: 'sawtooth', g: 0.12 * v }); break;
    case 'mark': tone(t, 0.06, { f: 1000, type: 'triangle', g: 0.25 * v }); noise(t, 0.04, { type: 'highpass', f: 6000, g: 0.2 * v }); break;
    case 'pickup': tone(t, 0.08, { f: 900, type: 'triangle', g: 0.2 * v }); tone(t + 0.08, 0.12, { f: 1350, type: 'triangle', g: 0.2 * v }); break;
    case 'weapon': for (let i = 0; i < 4; i++) tone(t + i * 0.1, 0.25, { f: [523, 659, 784, 1046][i], type: 'triangle', g: 0.2 * v }); break;
    case 'horse': noise(t, 0.6, { type: 'bandpass', f: 600, fEnd: 1200, q: 3, g: 0.3 * v }); tone(t, 0.5, { f: 500, fEnd: 300, type: 'sawtooth', g: 0.05 * v }); break;
    case 'gallop': for (let i = 0; i < 3; i++) noise(t + i * 0.09, 0.06, { type: 'lowpass', f: 400, g: 0.35 * v }); break;
    case 'step': noise(t, 0.05, { type: 'lowpass', f: 500, g: 0.12 * v }); break;
    case 'death': tone(t, 0.4, { f: 180, fEnd: 60, type: 'sawtooth', g: 0.08 * v, pan }); break;
    case 'win': for (let i = 0; i < 5; i++) tone(t + i * 0.14, 0.4, { f: [392, 523, 659, 784, 1046][i], type: 'triangle', g: 0.2 * v }); break;
    case 'thunder': noise(t, 3, { type: 'lowpass', f: 400, fEnd: 40, g: 1.2 * v, attack: 0.1, decay: 3 }); break;
    case 'ui': tone(t, 0.04, { f: 700, type: 'triangle', g: 0.15 * v }); break;
  }
}

// ===== muziek =====
// eigen westernmuziek: gitaar-plukjes, een fluitmelodie en in gevechten trommels. Alles in E-mineur.
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
let mood = null, nextT = 0, step = 0, timer = null;
const BASS = [40, 40, 47, 40, 45, 45, 47, 47, 40, 40, 47, 40, 43, 42, 40, 40];
const CHORD = [[52, 55, 59], [52, 55, 59], [54, 59, 62], [52, 55, 59], [57, 60, 64], [57, 60, 64], [54, 59, 63], [54, 59, 63]];
const MEL = [64, -1, 67, 71, 69, -1, 67, -1, 64, -1, 62, 64, 67, -1, -1, -1, 69, -1, 71, 72, 71, -1, 67, -1, 66, -1, 64, 62, 64, -1, -1, -1];
function pluck(t, n, g, len = 0.6) {
  const f = NOTE(n);
  tone(t, len, { f, type: 'triangle', g, dest: musicBus });
  tone(t, len * 0.5, { f: f * 2, type: 'sawtooth', g: g * 0.12, dest: musicBus });
}
function whistle(t, n, len) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = NOTE(n + 12);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = 6; lfo.connect(lg); lg.connect(o.frequency);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.06); g.gain.setValueAtTime(0.09, t + len - 0.08); g.gain.linearRampToValueAtTime(0, t + len);
  o.connect(g); g.connect(musicBus); o.start(t); lfo.start(t); o.stop(t + len + 0.05); lfo.stop(t + len + 0.05);
}
function tick() {
  if (!ctx || !mood) return;
  const spb = mood === 'combat' ? 0.15 : mood === 'duel' ? 0.5 : 0.22; // tijd per stap (achtste)
  while (nextT < ctx.currentTime + 0.25) {
    const t = nextT;
    const bar = Math.floor(step / 8) % 8;
    if (mood === 'duel') {
      if (step % 8 === 0) pluck(t, 40, 0.35, 2.5);
      if (step % 16 === 6) tone(t, 1.5, { f: NOTE(71), type: 'sine', g: 0.05, dest: musicBus });
    } else {
      if (step % 2 === 0) pluck(t, BASS[(step / 2) % 16], 0.3, 0.5);
      if (step % 2 === 1) { const c = CHORD[bar]; c.forEach((n, i) => pluck(t + i * 0.012, n, 0.07, 0.3)); }
      if (mood === 'calm') {
        const m = MEL[step % 32];
        if (m > 0 && Math.floor(step / 32) % 2 === 1) { let len = 1; while (MEL[(step + len) % 32] === -1 && len < 4) len++; whistle(t, m, len * spb); }
      } else {
        if (step % 4 === 0) { tone(t, 0.15, { f: 90, fEnd: 40, g: 0.5, dest: musicBus }); }
        if (step % 4 === 2) noise(t, 0.12, { type: 'bandpass', f: 1500, q: 0.8, g: 0.18, dest: musicBus });
        if (step % 8 === 7) noise(t, 0.05, { type: 'highpass', f: 6000, g: 0.1, dest: musicBus });
        if (step % 16 === 0) tone(t, spb * 7, { f: NOTE(BASS[(step / 2) % 16] + 24), type: 'sawtooth', g: 0.02, dest: musicBus });
      }
    }
    nextT += spb; step++;
  }
}
export function music(m) {
  if (!ctx) return;
  if (m === mood) return;
  mood = m;
  if (!m) return;
  nextT = Math.max(nextT, ctx.currentTime + 0.05);
  if (!timer) timer = setInterval(tick, 60);
}
