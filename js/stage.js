window.stageState = { bot: "unknown", market: "unknown" };

function startStage() {
  const canvas = document.getElementById("stage");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const glyphs = ["NVDA", "TSLA", "AAPL", "MSFT", "SPY", "QQQ", "AMD", "COIN", "WSLI", "BUY", "SELL"];
  let ticks = [];
  let nodes = [];
  let w = 0;
  let h = 0;
  let dpr = 1;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ticks = Array.from({ length: 46 }, () => ({
      x: Math.random() * w,
      z: Math.random(),
      lane: (Math.random() - 0.5) * 1.8,
      glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
      buy: Math.random() > 0.45,
    }));
    nodes = Array.from({ length: 18 }, (_, i) => ({
      a: (i / 18) * Math.PI * 2,
      r: 90 + (i % 5) * 28,
      phase: Math.random() * Math.PI * 2,
    }));
  };

  const drawGrid = (t, heat) => {
    const vanishX = w * 0.5;
    const vanishY = h * 0.22;
    ctx.strokeStyle = `rgba(61, 255, 154, ${0.05 + heat * 0.08})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i += 1) {
      const p = (i / 16 + (reduce ? 0 : t * 0.015)) % 1;
      const y = vanishY + (h - vanishY) * (p * p);
      const spread = 40 + p * w * 0.95;
      ctx.beginPath();
      ctx.moveTo(vanishX - spread, y);
      ctx.lineTo(vanishX + spread, y);
      ctx.stroke();
    }
    for (let i = -10; i <= 10; i += 1) {
      ctx.beginPath();
      ctx.moveTo(vanishX, vanishY);
      ctx.lineTo(vanishX + i * w * 0.09, h + 20);
      ctx.stroke();
    }
  };

  const drawRibbons = (t, heat) => {
    for (let r = 0; r < 3; r += 1) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = h * (0.18 + r * 0.08) + Math.sin(x * 0.006 + t * (0.6 + r * 0.2) + r) * (18 + r * 10);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(61, 255, 154, ${0.08 + heat * 0.1 - r * 0.02})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  };

  const drawTicks = (t, heat) => {
    ticks.forEach((tick) => {
      if (!reduce) tick.z -= 0.003 + heat * 0.004;
      if (tick.z <= 0) {
        tick.z = 1;
        tick.x = w / 2 + (Math.random() - 0.5) * 80;
        tick.glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
        tick.buy = Math.random() > 0.45;
      }
      const scale = 0.15 + (1 - tick.z) * 1.4;
      const x = w / 2 + tick.lane * (1 - tick.z) * w * 0.42;
      const y = h * 0.22 + (1 - tick.z) * h * 0.82;
      ctx.save();
      ctx.globalAlpha = 0.08 + (1 - tick.z) * (0.22 + heat * 0.2);
      ctx.fillStyle = tick.buy ? "#3dff9a" : "#ff6b7a";
      ctx.font = `${11 * scale}px "Fragment Mono", monospace`;
      ctx.fillText(tick.glyph, x, y);
      ctx.restore();
    });
  };

  const drawNodes = (t, heat) => {
    const cx = w * 0.82;
    const cy = h * 0.18;
    const pts = nodes.map((node) => {
      const spin = reduce ? node.a : node.a + t * 0.12;
      return {
        x: cx + Math.cos(spin) * node.r,
        y: cy + Math.sin(spin) * node.r * 0.42,
        pulse: 0.5 + Math.sin(t * 1.4 + node.phase) * 0.5,
      };
    });
    ctx.strokeStyle = `rgba(61, 255, 154, ${0.08 + heat * 0.12})`;
    pts.forEach((a, i) => {
      const b = pts[(i + 3) % pts.length];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
    pts.forEach((p) => {
      ctx.beginPath();
      ctx.fillStyle = `rgba(61, 255, 154, ${0.18 + p.pulse * 0.35 + heat * 0.2})`;
      ctx.arc(p.x, p.y, 1.6 + p.pulse * 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const frame = (stamp) => {
    const t = stamp / 1000;
    const heat = window.stageState.bot === "awake" ? 1 : window.stageState.market === "open" ? 0.55 : 0.2;
    ctx.fillStyle = "rgba(4, 8, 10, 0.42)";
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w * 0.5, h * 0.2, 10, w * 0.5, h * 0.2, w * 0.55);
    g.addColorStop(0, `rgba(61, 255, 154, ${0.08 + heat * 0.1})`);
    g.addColorStop(1, "rgba(4, 8, 10, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    drawGrid(t, heat);
    drawRibbons(t, heat);
    drawTicks(t, heat);
    drawNodes(t, heat);
    if (!reduce) requestAnimationFrame(frame);
  };

  resize();
  window.addEventListener("resize", resize);
  if (reduce) {
    frame(0);
    return;
  }
  requestAnimationFrame(frame);
}
