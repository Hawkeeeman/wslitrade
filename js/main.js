// Terminal typewriter simulation
const terminalLines = [
  { html: '<span class="dim">[09:31:02]</span> <span class="prompt">wsli></span> scan --universe us_equities --min_volume 2M' },
  { html: '<span class="dim">[09:31:04]</span> screening... <span class="symbol">847</span> candidates' },
  { html: '<span class="dim">[09:31:08]</span> <span class="prompt">wsli></span> analyze <span class="symbol">NVDA</span> --depth full' },
  { html: '  ├─ earnings: beat +12% rev, guidance raised' },
  { html: '  ├─ sentiment: 0.78 bullish (24h news window)' },
  { html: '  ├─ technical: above 50/200 SMA, RSI 58' },
  { html: '  └─ risk score: <span class="action">LOW</span> (2.1/10)' },
  { html: '<span class="dim">[09:31:15]</span> <span class="prompt">wsli></span> <span class="action">BUY</span> NVDA x50 @ MKT <span class="dim">// tailnet: broker-node</span>' },
  { html: '<span class="dim">[09:31:16]</span> order routed → <span class="accent" style="color:#00e87b">FILLED</span> @ 892.34' },
  { html: '<span class="dim">[09:31:17]</span> position logged. audit trail: <span class="dim">session/a7f3...</span>' },
  { html: '<span class="dim">[09:31:18]</span> <span class="prompt">wsli></span> monitor --positions active' },
  { html: '  watching 4 positions across 3 sectors...' },
];

const terminal = document.getElementById('terminal-output');
let lineIndex = 0;

function addLine() {
  if (lineIndex >= terminalLines.length) {
    setTimeout(() => {
      terminal.innerHTML = '';
      lineIndex = 0;
      addLine();
    }, 4000);
    return;
  }

  const div = document.createElement('div');
  div.className = 'line';
  div.innerHTML = terminalLines[lineIndex].html;
  div.style.animationDelay = '0s';
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
  lineIndex++;

  const delay = lineIndex <= 2 ? 400 : lineIndex <= 7 ? 350 : 500;
  setTimeout(addLine, delay);
}

addLine();

// Mini sparkline chart
const canvas = document.getElementById('chart');
if (canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 200 * dpr;
  canvas.height = 80 * dpr;
  ctx.scale(dpr, dpr);

  const points = [];
  let y = 40;
  for (let i = 0; i < 60; i++) {
    y += (Math.random() - 0.45) * 4;
    y = Math.max(10, Math.min(70, y));
    points.push(y);
  }

  function drawChart(offset = 0) {
    ctx.clearRect(0, 0, 200, 80);

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, 80);
    grad.addColorStop(0, 'rgba(0, 232, 123, 0.15)');
    grad.addColorStop(1, 'rgba(0, 232, 123, 0)');

    ctx.beginPath();
    points.forEach((p, i) => {
      const x = (i / (points.length - 1)) * 200;
      const py = p + Math.sin((i + offset) * 0.1) * 2;
      i === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
    });
    ctx.lineTo(200, 80);
    ctx.lineTo(0, 80);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = (i / (points.length - 1)) * 200;
      const py = p + Math.sin((i + offset) * 0.1) * 2;
      i === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
    });
    ctx.strokeStyle = '#00e87b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  let frame = 0;
  function animate() {
    drawChart(frame * 0.05);
    frame++;
    requestAnimationFrame(animate);
  }
  animate();
}

// Ticker strip
const tickers = [
  { sym: 'AAPL', price: '227.84', change: '+1.24', dir: 'up' },
  { sym: 'MSFT', price: '428.15', change: '+0.87', dir: 'up' },
  { sym: 'GOOGL', price: '178.62', change: '-0.34', dir: 'down' },
  { sym: 'AMZN', price: '198.41', change: '+2.11', dir: 'up' },
  { sym: 'NVDA', price: '892.34', change: '+3.45', dir: 'up' },
  { sym: 'TSLA', price: '245.18', change: '-1.02', dir: 'down' },
  { sym: 'META', price: '562.77', change: '+0.56', dir: 'up' },
  { sym: 'JPM', price: '198.93', change: '+0.12', dir: 'up' },
  { sym: 'V', price: '287.44', change: '-0.08', dir: 'down' },
  { sym: 'UNH', price: '512.30', change: '+1.67', dir: 'up' },
];

const tickerEl = document.getElementById('ticker');
if (tickerEl) {
  const items = tickers.map(t =>
    `<span class="ticker-item"><span class="sym">${t.sym}</span>${t.price} <span class="${t.dir}">${t.change}%</span></span>`
  ).join('');
  tickerEl.innerHTML = items + items;
}

// Nav scroll effect
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
  nav.style.background = window.scrollY > 50
    ? 'rgba(8, 12, 16, 0.92)'
    : 'linear-gradient(to bottom, var(--bg) 60%, transparent)';
});
