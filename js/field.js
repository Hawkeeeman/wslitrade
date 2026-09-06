window.stageState = { bot: "unknown", market: "unknown" };

function startField() {
  const canvas = document.getElementById("stage");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let series = [];
  let ghosts = [];

  const rnd = (i, seed) => {
    const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  const makeSeries = (n, seed, bias) => {
    const pts = [];
    let v = 0.28;
    for (let i = 0; i < n; i += 1) {
      const wave = Math.sin(i * 0.11 + seed) * 0.016 + Math.sin(i * 0.037 + seed * 2) * 0.012;
      const noise = (rnd(i, seed) - 0.46) * 0.02;
      v = Math.max(0.14, Math.min(0.86, v + bias + wave + noise));
      pts.push(v);
    }
    return pts;
  };

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.max(120, Math.floor(w / 8));
    series = makeSeries(n, 1.7, 0.0024);
    ghosts = [makeSeries(n, 4.2, 0.0011), makeSeries(n, 8.9, 0.0006)];
  };

  const map = (values, i) => {
    const padL = w * 0.36;
    const padR = w * 0.05;
    const top = h * 0.22;
    const bot = h * 0.88;
    const t = i / (values.length - 1);
    return {
      x: padL + t * (w - padL - padR),
      y: bot - values[i] * (bot - top),
    };
  };

  const strokePath = (values, reveal) => {
    const last = Math.max(2, Math.floor((values.length - 1) * reveal));
    ctx.beginPath();
    for (let i = 0; i <= last; i += 1) {
      const p = map(values, i);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
  };

  const drawRails = () => {
    ctx.strokeStyle = "rgba(243, 239, 230, 0.045)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i += 1) {
      const y = h * (0.22 + i * 0.12);
      ctx.beginPath();
      ctx.moveTo(w * 0.08, y);
      ctx.lineTo(w * 0.96, y);
      ctx.stroke();
    }
  };

  const drawGhost = (values, reveal, alpha) => {
    strokePath(values, reveal);
    ctx.strokeStyle = `rgba(61, 255, 154, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  const drawMain = (reveal, heat) => {
    const last = Math.max(2, Math.floor((series.length - 1) * reveal));
    const head = map(series, last);
    const origin = map(series, 0);

    const fill = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.9);
    fill.addColorStop(0, `rgba(61, 255, 154, ${0.16 + heat * 0.1})`);
    fill.addColorStop(1, "rgba(61, 255, 154, 0)");
    strokePath(series, reveal);
    ctx.lineTo(head.x, h * 0.88);
    ctx.lineTo(origin.x, h * 0.88);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.save();
    ctx.shadowColor = `rgba(61, 255, 154, ${0.35 + heat * 0.35})`;
    ctx.shadowBlur = 18 + heat * 16;
    strokePath(series, reveal);
    ctx.strokeStyle = `rgba(61, 255, 154, ${0.72 + heat * 0.2})`;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    const pulse = 0.65 + Math.sin(performance.now() / 420) * 0.35;
    ctx.beginPath();
    ctx.fillStyle = `rgba(61, 255, 154, ${0.12 + pulse * 0.12})`;
    ctx.arc(head.x, head.y, 16 + pulse * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#e8ffe8";
    ctx.arc(head.x, head.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  };

  const frame = (stamp) => {
    const t = stamp / 1000;
    const heat = window.stageState.bot === "awake" ? 1 : window.stageState.market === "open" ? 0.55 : 0.28;
    const reveal = reduce ? 1 : Math.min(1, t / 2.6);

    ctx.fillStyle = "#04080a";
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(w * 0.72, h * 0.38, 20, w * 0.72, h * 0.38, w * 0.55);
    glow.addColorStop(0, `rgba(61, 255, 154, ${0.07 + heat * 0.06})`);
    glow.addColorStop(1, "rgba(4, 8, 10, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    drawRails();
    ghosts.forEach((g, i) => drawGhost(g, reveal, 0.08 + i * 0.03));
    drawMain(reveal, heat);

    if (!reduce && reveal < 1) requestAnimationFrame(frame);
    else if (!reduce) requestAnimationFrame(frame);
  };

  resize();
  window.addEventListener("resize", resize);
  if (reduce) {
    frame(4000);
    return;
  }
  requestAnimationFrame(frame);
}
