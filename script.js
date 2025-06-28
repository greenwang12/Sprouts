const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const statusP = document.getElementById("status");
const dotCountInput = document.getElementById("dotCount");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const undoBtn = document.getElementById("undoBtn");

const LOGICAL_WIDTH = 1000;
const LOGICAL_HEIGHT = 600;
const DOT_RADIUS = 7;

let dots = [], lines = [], selected = [], currentPlayer = 1;
let controlPoint = null, isDraggingControl = false, pendingLine = null;
let curveLocked = false, gameOver = false, lastPlayer = null, hoverDot = null;

// 🟦 Panning Variables
let viewOffset = { x: 0, y: 0 };
let isPanning = false;
let lastPan = { x: 0, y: 0 };

function fixCanvasResolution() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = LOGICAL_WIDTH * dpr;
  canvas.height = LOGICAL_HEIGHT * dpr;
  canvas.style.width = LOGICAL_WIDTH + "px";
  canvas.style.height = LOGICAL_HEIGHT + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

startBtn.onclick = () => {
  gameOver = false;
  document.querySelector(".controls-container").classList.add("hidden");
  document.querySelector(".canvas-wrapper").classList.remove("hidden");
  document.querySelector(".button-row").classList.remove("hidden");
  document.querySelector(".rules-wrapper").classList.remove("hidden");

  setupBoard();
  createDots(parseInt(dotCountInput.value));
  draw();
};

restartBtn.onclick = () => {
  gameOver = false;
  document.querySelector(".controls-container").classList.remove("hidden");
  document.querySelector(".canvas-wrapper").classList.add("hidden");
  document.querySelector(".button-row").classList.add("hidden");
  document.querySelector(".rules-wrapper").classList.add("hidden"); // ✅ Hide rules again
  statusP.textContent = 'Click "Start" to begin';
};

undoBtn.onclick = () => undoMove();

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "u") undoMove();
});

function setupBoard() {
  fixCanvasResolution();
  dots = [];
  lines = [];
  selected = [];
  controlPoint = null;
  pendingLine = null;
  curveLocked = false;
  currentPlayer = 1;
  viewOffset = { x: 0, y: 0 };
  statusP.textContent = "Player 1's turn";
}

function createDots(n) {
  dots = [];
  const rows = Math.ceil(Math.sqrt(n));
  const cols = Math.ceil(n / rows);
  const spacingX = LOGICAL_WIDTH / (cols + 1);
  const spacingY = LOGICAL_HEIGHT / (rows + 1);

  let count = 0;
  for (let row = 0; row < rows && count < n; row++) {
    for (let col = 0; col < cols && count < n; col++) {
      const x = spacingX * (col + 1);
      const y = spacingY * (row + 1);
      dots.push({ x, y, connections: 0 });
      count++;
    }
  }
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.onmousedown = (e) => {
  const canvasX = e.offsetX - viewOffset.x;
  const canvasY = e.offsetY - viewOffset.y;
  const clickedDot = dots.find(dot => distance(dot, { x: canvasX, y: canvasY }) < DOT_RADIUS + 3);

  // ✅ Allow panning even after game is over
  if (e.button === 0 && !clickedDot && !pendingLine) {
    isPanning = true;
    lastPan = { x: e.clientX, y: e.clientY };
    return;
  }

  // ❌ Block game logic if game is over
  if (gameOver) return;


   // 🟨 Right-click to lock curve
  if (e.button === 2 && pendingLine) {
    curveLocked = true;
    return;
  }

  if (!clickedDot || clickedDot.connections >= 3) return;

  if (pendingLine) {
    if (controlPoint && distance({ x: canvasX, y: canvasY }, controlPoint) < 10) {
      isDraggingControl = true;
    }
    return;
  }

  if (selected.length === 1 && selected[0] === clickedDot) {
    const offset = 40;
    const left = { x: clickedDot.x - offset, y: clickedDot.y };
    const right = { x: clickedDot.x + offset, y: clickedDot.y };
    const cp = { x: clickedDot.x, y: clickedDot.y - 2 * offset };

    controlPoint = { ...cp };
    pendingLine = {
      a: left,
      b: right,
      cp: cp,
      type: "loop",
      center: clickedDot
    };
    curveLocked = false;
    statusP.textContent = `Player ${currentPlayer}'s turn: Right click to lock the loop.Then Double-click on the loop to place a new dot.`;
  } else {
    selected.push(clickedDot);
    if (selected.length === 2) {
      const mid = midpoint(selected[0], selected[1]);
      controlPoint = { x: mid.x + 30, y: mid.y - 30 };
      pendingLine = {
        a: selected[0],
        b: selected[1],
        type: "curve",
        cp: { ...controlPoint }
      };
      curveLocked = false;
      statusP.textContent = `Player ${currentPlayer}'s turn: Right click to lock the curve.Then Double-click on the curve to place a new dot.`;
    }
  }

  draw();
};

canvas.onmousemove = (e) => {
  if (isPanning) {
    const dx = e.clientX - lastPan.x;
    const dy = e.clientY - lastPan.y;
    viewOffset.x += dx;
    viewOffset.y += dy;
    lastPan = { x: e.clientX, y: e.clientY };
    draw();
    return;
  }

  const x = e.offsetX - viewOffset.x;
  const y = e.offsetY - viewOffset.y;
  hoverDot = dots.find(dot => distance(dot, { x, y }) < DOT_RADIUS + 3) || null;

  if (isDraggingControl && controlPoint) {
    controlPoint.x = x;
    controlPoint.y = y;
    pendingLine.cp = { ...controlPoint };
  } else if (pendingLine && !curveLocked) {
    controlPoint.x = x;
    controlPoint.y = y;
    pendingLine.cp = { ...controlPoint };
  }

  draw();
};

canvas.onmouseup = () => {
  isPanning = false;
  isDraggingControl = false;
};

canvas.ondblclick = (e) => {
  const x = e.offsetX - viewOffset.x;
  const y = e.offsetY - viewOffset.y;
  if (pendingLine && isNearPath({ x, y }, pendingLine)) {
    completeConnection({ x, y });
  } else if (pendingLine) {
    statusP.textContent = "Double-click on the curve to place a new dot.";
  }
};

function completeConnection(dotPos) {
  let a = pendingLine.a;
  let b = pendingLine.b;
  let newDot;

  if (pendingLine.type === "loop") {
  const center = pendingLine.center;

  // ✅ Self-loop uses 2 connections; disallow if already 2 or more
  if (center.connections >= 2 || intersectsAny(pendingLine)) {
    statusP.textContent = "Invalid move.";
    resetSelection();
    return;
  }

  center.connections += 2; // ✅ Self-loop counts as 2 connections

    newDot = getCurvePoint(a, pendingLine.cp, b, 0.5);
    newDot.connections = 2;
    dots.push(newDot);
    const p01 = midpoint(a, pendingLine.cp);
    const p12 = midpoint(pendingLine.cp, b);
    lines.push({ a: a, b: newDot, cp: p01, type: "curve" });
    lines.push({ a: newDot, b: b, cp: p12, type: "curve" });
  } else {
    if (a.connections >= 3 || b.connections >= 3 || intersectsAny(pendingLine)) {
      statusP.textContent = "Invalid move.";
      resetSelection();
      return;
    }

    a.connections++;
    b.connections++;
    const p01 = midpoint(a, pendingLine.cp);
    const p12 = midpoint(pendingLine.cp, b);
    const mid = midpoint(p01, p12);
    newDot = { x: mid.x, y: mid.y, connections: 2 };
    dots.push(newDot);
    lines.push({ a: a, b: newDot, cp: p01, type: "curve" });
    lines.push({ a: newDot, b: b, cp: p12, type: "curve" });
  }

  lastPlayer = currentPlayer;
  currentPlayer = currentPlayer === 1 ? 2 : 1;
  resetSelection();
  draw();

  if (!hasMoves()) {
    gameOver = true;
    statusP.textContent = `Game Over! Player ${lastPlayer} wins! (The one who made the last valid move wins🥳 )`;
  } else {
    statusP.textContent = `Player ${currentPlayer}'s turn`;
  }
}

function resetSelection() {
  selected = [];
  pendingLine = null;
  controlPoint = null;
  curveLocked = false;
}

function undoMove() {
  if (pendingLine) {
    selected = [];
    pendingLine = null;
    controlPoint = null;
    curveLocked = false;
    statusP.textContent = `Player ${currentPlayer}'s turn: Move undone.`;
    draw();
  } else if (selected.length > 0) {
    selected.pop();
    statusP.textContent = `Player ${currentPlayer}'s turn: Dot deselected.`;
    draw();
  } else {
    statusP.textContent = `Nothing to undo.`;
  }
}

function draw() {
  ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  ctx.save();
  ctx.translate(viewOffset.x, viewOffset.y); // 🟦 pan the canvas

  for (const line of lines) drawCurve(line.a, line.cp, line.b, "#555", 2);
  if (pendingLine) drawCurve(pendingLine.a, pendingLine.cp, pendingLine.b, "#888", 1, true);
  for (const dot of dots) drawDot(dot);

  if (controlPoint) {
    ctx.beginPath();
    ctx.fillStyle = "orange";
    ctx.arc(controlPoint.x, controlPoint.y, 6, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.restore();
}

function drawDot(dot) {
  ctx.beginPath();
  let color = "#67c2ff";
  if (dot.connections >= 3) color = "#f26d6d";
  else if (selected.includes(dot)) color = "#00cc99";

  ctx.fillStyle = color;
  ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, 2 * Math.PI);
  ctx.fill();

  if (hoverDot && hoverDot === dot && !selected.includes(dot) && dot.connections < 3) {
    ctx.beginPath();
    ctx.strokeStyle = "#00ccff";
    ctx.lineWidth = 2;
    ctx.arc(dot.x, dot.y, DOT_RADIUS + 4, 0, 2 * Math.PI);
    ctx.stroke();
  }

  if (selected.includes(dot)) {
    ctx.beginPath();
    ctx.strokeStyle = "#00cc99";
    ctx.lineWidth = 2;
    ctx.arc(dot.x, dot.y, DOT_RADIUS + 4, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

function drawCurve(a, cp, b, color, width, dashed = false) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dashed) ctx.setLineDash([5, 5]);
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(cp.x, cp.y, b.x, b.y);
  ctx.stroke();
  if (dashed) ctx.setLineDash([]);
}

function intersectsAny(newLine) {
  return lines.some(line => checkIntersection(line, newLine));
}

function checkIntersection(line1, line2) {
  return curveIntersectsCurve(line1, line2);
}

function curveIntersectsCurve(c1, c2) {
  const pts1 = [], pts2 = [];
  for (let t = 0; t <= 1; t += 0.02) {
    pts1.push(getCurvePoint(c1.a, c1.cp, c1.b, t));
    pts2.push(getCurvePoint(c2.a, c2.cp, c2.b, t));
  }

  if (
    isSameEndpoints(c1.a, c2.a) || isSameEndpoints(c1.a, c2.b) ||
    isSameEndpoints(c1.b, c2.a) || isSameEndpoints(c1.b, c2.b)
  ) return false;

  for (let i = 0; i < pts1.length - 1; i++) {
    for (let j = 0; j < pts2.length - 1; j++) {
      if (linesIntersect(pts1[i], pts1[i + 1], pts2[j], pts2[j + 1])) return true;
    }
  }
  return false;
}

function isSameEndpoints(p1, p2) {
  return distance(p1, p2) < 0.1;
}

function linesIntersect(p1, p2, q1, q2) {
  const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  return ccw(p1, q1, q2) !== ccw(p2, q1, q2) && ccw(p1, p2, q1) !== ccw(p1, p2, q2);
}

function getCurvePoint(a, cp, b, t) {
  return {
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cp.x + t ** 2 * b.x,
    y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cp.y + t ** 2 * b.y
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function isNearPath(p, line) {
  for (let t = 0; t <= 1; t += 0.02) {
    const pt = getCurvePoint(line.a, line.cp, line.b, t);
    if (distance(p, pt) < 5) return true;
  }
  return false;
}

function hasMoves() {
  const controlOffsets = [
    { x: 30, y: -30 }, { x: -30, y: 30 },
    { x: 40, y: 0 }, { x: 0, y: 40 },
    { x: -40, y: 0 }, { x: 0, y: -40 }
  ];

  for (let i = 0; i < dots.length; i++) {
    const a = dots[i];
    if (a.connections >= 3) continue;

    // 🔄 Check self-loop
    if (a.connections <= 1) {
      for (const offset of controlOffsets) {
        const left = { x: a.x - 20, y: a.y };
        const right = { x: a.x + 20, y: a.y };
        const cp = { x: a.x + offset.x, y: a.y + offset.y };

        const mid = getCurvePoint(left, cp, right, 0.5);
        const p01 = midpoint(left, cp);
        const p12 = midpoint(cp, right);

        const seg1 = { a: left, b: mid, cp: p01 };
        const seg2 = { a: mid, b: right, cp: p12 };

        if (!intersectsAny(seg1) && !intersectsAny(seg2)) return true;
      }
    }

    // 🔄 Check between two different dots
    for (let j = 0; j < dots.length; j++) {
      if (i === j) continue;
      const b = dots[j];
      if (b.connections >= 3) continue;

      for (const offset of controlOffsets) {
        const cpMid = midpoint(a, b);
        const cp = { x: cpMid.x + offset.x, y: cpMid.y + offset.y };

        const p01 = midpoint(a, cp);
        const p12 = midpoint(cp, b);
        const mid = midpoint(p01, p12);

        const seg1 = { a: a, b: mid, cp: p01 };
        const seg2 = { a: mid, b: b, cp: p12 };

        if (!intersectsAny(seg1) && !intersectsAny(seg2)) return true;
      }
    }
  }

  return false;
}

