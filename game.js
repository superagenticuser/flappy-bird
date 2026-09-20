(() => {
  'use strict';

  // ---------- Setup ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const W = 420, H = 640;          // logical canvas size
  const GROUND_H = 88;             // ground strip height
  const GRAV = 0.42, FLAP = -7.4, MAXFALL = 11;
  const BIRD_X = 120, BIRD_R = 14;
  const PIPE_W = 68, GAP = 170, SPACING = 235, SPEED = 2.5;

  const $ = (id) => document.getElementById(id);
  const wrap = $('gameWrap');
  const startPanel = $('startPanel');
  const overPanel = $('overPanel');
  const bestStartEl = $('bestStart');
  const finalScoreEl = $('finalScore');
  const finalBestEl = $('finalBest');
  const medalEl = $('medal');
  const newBestEl = $('newBest');
  const soundBtn = $('soundBtn');

  let state = 'ready'; // ready | play | over
  let frames = 0;
  let bird, pipes, clouds, groundX, score, flash, deadT, panelShown;
  let best = parseInt(localStorage.getItem('flappy-best') || '0', 10) || 0;
  let soundOn = localStorage.getItem('flappy-sound') !== 'off';
  let audioCtx = null;

  const skyGrad = ctx.createLinearGradient(0, 0, 0, H - GROUND_H);
  skyGrad.addColorStop(0, '#4aa8e8');
  skyGrad.addColorStop(0.7, '#8fd4f7');
  skyGrad.addColorStop(1, '#c8ecff');

  const pipeGrad = ctx.createLinearGradient(0, 0, PIPE_W, 0);
  pipeGrad.addColorStop(0, '#5da23a');
  pipeGrad.addColorStop(0.5, '#8fd65f');
  pipeGrad.addColorStop(1, '#4c8a2e');

  // ---------- Audio (tiny synth, no assets) ----------
  function ac() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function beep(freq, dur, type, vol, slideTo, delay) {
    if (!soundOn) return;
    try {
      const a = ac();
      if (!a) return;
      const t = a.currentTime + (delay || 0);
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol || 0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(a.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) { /* audio unavailable — stay silent */ }
  }

  const sfx = {
    flap: () => beep(520, 0.09, 'square', 0.08, 240),
    score: () => { beep(880, 0.09, 'sine', 0.14); beep(1318, 0.12, 'sine', 0.14, null, 0.08); },
    hit: () => beep(170, 0.25, 'sawtooth', 0.2, 55),
    swoosh: () => beep(280, 0.18, 'sine', 0.07, 620),
  };

  // ---------- World ----------
  function reset() {
    bird = { y: H * 0.44, vy: 0, rot: 0, wing: 0 };
    pipes = [];
    clouds = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({
        x: Math.random() * W,
        y: 40 + Math.random() * 190,
        s: 0.6 + Math.random() * 0.9,
        v: 0.25 + Math.random() * 0.4,
      });
    }
    groundX = 0;
    score = 0;
    flash = 0;
    deadT = 0;
    panelShown = false;
    spawnPipe(W + 120);
  }

  function spawnPipe(x) {
    const margin = 100;
    const gapY = margin + GAP / 2 + Math.random() * (H - GROUND_H - margin * 2 - GAP);
    pipes.push({ x: x, gapY: gapY, scored: false });
  }

  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function hitsPipe(p) {
    const topH = p.gapY - GAP / 2;
    const botY = p.gapY + GAP / 2;
    return (
      circleRect(BIRD_X, bird.y, BIRD_R - 2, p.x, -20, PIPE_W, topH + 20) ||
      circleRect(BIRD_X, bird.y, BIRD_R - 2, p.x, botY, PIPE_W, H - GROUND_H - botY + 20)
    );
  }

  function die() {
    if (state !== 'play') return;
    state = 'over';
    flash = 1;
    sfx.hit();
  }

  function medalFor(s) {
    if (s >= 40) return '🏆';
    if (s >= 30) return '🥇';
    if (s >= 20) return '🥈';
    if (s >= 10) return '🥉';
    return '';
  }

  function showGameOver() {
    panelShown = true;
    const isBest = score > best;
    if (isBest) {
      best = score;
      localStorage.setItem('flappy-best', String(best));
    }
    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;
    medalEl.textContent = medalFor(score);
    newBestEl.classList.toggle('hidden', !isBest);
    overPanel.classList.remove('hidden');
    sfx.swoosh();
  }

  function startGame() {
    ac(); // unlock audio on the user gesture
    reset();
    startPanel.classList.add('hidden');
    overPanel.classList.add('hidden');
    state = 'play';
    bird.vy = FLAP;
    sfx.flap();
  }

  // ---------- Update ----------
  function update(dt) {
    frames += dt;

    // ambient motion in every state
    for (const c of clouds) {
      c.x -= c.v * dt;
      if (c.x < -90) { c.x = W + 80; c.y = 40 + Math.random() * 190; }
    }
    groundX = (groundX + (state === 'play' ? SPEED : SPEED * 0.4) * dt) % 48;

    if (state === 'ready') {
      bird.y = H * 0.44 + Math.sin(frames * 0.09) * 9;
      bird.wing += dt * 0.5;
      bird.rot = Math.sin(frames * 0.09 + 1) * 0.08;
      return;
    }

    if (state === 'play') {
      bird.vy = Math.min(bird.vy + GRAV * dt, MAXFALL);
      bird.y += bird.vy * dt;
      bird.wing += dt * 0.55;

      const targetRot = bird.vy < 0 ? -0.38 : Math.min(Math.PI / 2.4, bird.vy * 0.085);
      bird.rot += (targetRot - bird.rot) * Math.min(1, 0.25 * dt);

      // ceiling: clamp, don't die
      if (bird.y - BIRD_R < 0) { bird.y = BIRD_R; bird.vy = 0; }

      for (const p of pipes) p.x -= SPEED * dt;

      const last = pipes[pipes.length - 1];
      if (!last || last.x < W - SPACING) {
        spawnPipe(last ? last.x + SPACING : W + 80);
      }
      pipes = pipes.filter((p) => p.x > -PIPE_W - 20);

      for (const p of pipes) {
        if (!p.scored && p.x + PIPE_W < BIRD_X - BIRD_R) {
          p.scored = true;
          score++;
          sfx.score();
        }
        if (hitsPipe(p)) { die(); break; }
      }

      if (bird.y + BIRD_R >= H - GROUND_H) {
        bird.y = H - GROUND_H - BIRD_R;
        die();
      }
      return;
    }

    // state === 'over': bird tumbles to the ground, then show the panel
    if (bird.y + BIRD_R < H - GROUND_H) {
      bird.vy = Math.min(bird.vy + GRAV * dt, MAXFALL);
      bird.y = Math.min(bird.y + bird.vy * dt, H - GROUND_H - BIRD_R);
      bird.rot = Math.min(bird.rot + 0.08 * dt, Math.PI / 2);
    }
    deadT += dt;
    if (!panelShown && deadT > 45) showGameOver();
  }

  // ---------- Draw ----------
  function drawCloud(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.arc(24, -8, 18, 0, Math.PI * 2);
    ctx.arc(48, 0, 20, 0, Math.PI * 2);
    ctx.arc(24, 8, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPipe(x, topH, botY) {
    const capH = 26, capOver = 4;
    ctx.fillStyle = pipeGrad;
    ctx.strokeStyle = '#2f5c1c';
    ctx.lineWidth = 3;

    // top pipe body + cap
    ctx.fillRect(x, 0, PIPE_W, topH - capH);
    ctx.strokeRect(x, 0, PIPE_W, topH - capH);
    ctx.fillRect(x - capOver, topH - capH, PIPE_W + capOver * 2, capH);
    ctx.strokeRect(x - capOver, topH - capH, PIPE_W + capOver * 2, capH);

    // bottom pipe cap + body
    const botH = H - GROUND_H - botY;
    ctx.fillRect(x - capOver, botY, PIPE_W + capOver * 2, capH);
    ctx.strokeRect(x - capOver, botY, PIPE_W + capOver * 2, capH);
    ctx.fillRect(x, botY + capH, PIPE_W, botH - capH);
    ctx.strokeRect(x, botY + capH, PIPE_W, botH - capH);
  }

  function drawBird() {
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(bird.rot);

    // wing (flaps)
    const flapA = Math.sin(bird.wing * 2.2) * 0.7;
    ctx.save();
    ctx.translate(-4, 2);
    ctx.rotate(-0.5 + flapA * 0.5);
    ctx.fillStyle = '#f0a832';
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-8, 0, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // body
    ctx.fillStyle = '#ffd93d';
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // belly
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.ellipse(2, 6, 8, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(5, -5, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(6.8, -5, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(7.6, -5.8, 0.9, 0, Math.PI * 2);
    ctx.fill();

    // beak
    ctx.fillStyle = '#fb923c';
    ctx.strokeStyle = '#c2410c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(BIRD_R - 2, -1);
    ctx.lineTo(BIRD_R + 8, 2.5);
    ctx.lineTo(BIRD_R - 2, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function draw() {
    // sky
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H - GROUND_H);

    // sun
    const sunG = ctx.createRadialGradient(W - 88, 86, 8, W - 88, 86, 52);
    sunG.addColorStop(0, 'rgba(255,246,190,1)');
    sunG.addColorStop(0.5, 'rgba(255,240,160,0.85)');
    sunG.addColorStop(1, 'rgba(255,240,160,0)');
    ctx.fillStyle = sunG;
    ctx.fillRect(W - 150, 24, 124, 124);

    // clouds
    for (const c of clouds) drawCloud(c.x, c.y, c.s);

    // distant hills
    ctx.fillStyle = '#a5e08f';
    ctx.beginPath();
    ctx.moveTo(0, H - GROUND_H);
    for (let x = 0; x <= W; x += 10) {
      ctx.lineTo(x, H - GROUND_H - 60 - Math.sin(x * 0.02 + 1.3) * 34 - Math.sin(x * 0.055) * 12);
    }
    ctx.lineTo(W, H - GROUND_H);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#7ecb72';
    ctx.beginPath();
    ctx.moveTo(0, H - GROUND_H);
    for (let x = 0; x <= W; x += 10) {
      ctx.lineTo(x, H - GROUND_H - 26 - Math.sin(x * 0.03 + 4) * 18);
    }
    ctx.lineTo(W, H - GROUND_H);
    ctx.closePath();
    ctx.fill();

    // pipes
    for (const p of pipes) {
      drawPipe(p.x, p.gapY - GAP / 2, p.gapY + GAP / 2);
    }

    // ground
    const gy = H - GROUND_H;
    ctx.fillStyle = '#e6da9c';
    ctx.fillRect(0, gy, W, GROUND_H);
    ctx.fillStyle = '#8a7f3f';
    ctx.fillRect(0, gy, W, 7);
    ctx.fillStyle = '#d3c57f';
    for (let x = -48; x < W + 48; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x - groundX + 48, gy + 7);
      ctx.lineTo(x - groundX + 48 + 22, gy + 7);
      ctx.lineTo(x - groundX + 22, gy + GROUND_H);
      ctx.lineTo(x - groundX, gy + GROUND_H);
      ctx.closePath();
      ctx.fill();
    }

    drawBird();

    // score / prompts
    if (state === 'ready') {
      ctx.textAlign = 'center';
      ctx.font = '900 40px "Trebuchet MS", sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(15,23,42,0.75)';
      ctx.strokeText('GET READY!', W / 2, 200);
      ctx.fillStyle = '#fff';
      ctx.fillText('GET READY!', W / 2, 200);
      ctx.font = '700 18px "Trebuchet MS", sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeText('Tap to flap', W / 2, 236);
      ctx.fillText('Tap to flap', W / 2, 236);
    } else {
      ctx.textAlign = 'center';
      ctx.font = '900 52px "Trebuchet MS", sans-serif';
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(15,23,42,0.8)';
      ctx.strokeText(String(score), W / 2, 100);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(score), W / 2, 100);
    }

    // hit flash
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.85).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - 0.06 * lastDt);
    }
  }

  // ---------- Main loop ----------
  let lastT = 0;
  let lastDt = 1;
  function loop(t) {
    const dt = Math.min(3, Math.max(0.1, (t - lastT) / 16.667 || 1));
    lastT = t;
    lastDt = dt;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- Input ----------
  function press(e) {
    if (e && e.target && e.target.closest && e.target.closest('button')) return;
    if (e && e.cancelable) e.preventDefault();
    ac(); // unlock audio on first gesture
    if (state === 'ready') {
      startPanel.classList.add('hidden');
      state = 'play';
      bird.vy = FLAP;
      sfx.flap();
    } else if (state === 'play') {
      bird.vy = FLAP;
      sfx.flap();
    }
    // in 'over' state taps do nothing — use the restart button
  }

  wrap.addEventListener('pointerdown', press);
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat) {
      e.preventDefault();
      press();
    }
  });
  // avoid huge dt jumps when the tab was hidden
  document.addEventListener('visibilitychange', () => { lastT = performance.now(); });

  $('playBtn').addEventListener('click', (e) => { e.stopPropagation(); startGame(); });
  $('restartBtn').addEventListener('click', (e) => { e.stopPropagation(); startGame(); });

  function renderSoundBtn() {
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
  }
  soundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    soundOn = !soundOn;
    localStorage.setItem('flappy-sound', soundOn ? 'on' : 'off');
    renderSoundBtn();
    if (soundOn) sfx.flap();
  });
  renderSoundBtn();

  // ---------- Go ----------
  bestStartEl.textContent = best;
  reset();
  requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(loop); });
})();
