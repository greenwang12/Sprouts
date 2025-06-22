const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const statusP = document.getElementById("status");
const dotCountInput = document.getElementById("dotCount");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

const LOGICAL_WIDTH = 1000;
const LOGICAL_HEIGHT = 600;
const DOT_RADIUS = 7;

let dots = [], lines = [], selected = [], currentPlayer = 1;
let controlPoint = null, isDraggingControl = false, pendingLine = null;
let curveLocked = false, gameOver = false, lastPlayer = null, hoverDot = null;

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
  restartBtn.classList.remove("hidden");
  setupBoard();
  createDots(parseInt(dotCountInput.value));
  draw();
};

restartBtn.onclick = () => {
  gameOver = false;
  document.querySelector(".controls-container").classList.remove("hidden");
  document.querySelector(".canvas-wrapper").classList.add("hidden");
  restartBtn.classList.add("hidden");
  statusP.textContent = 'Click "Start" to begin';
};

function setupBoard() {
  fixCanvasResolution();
  dots = [];
  lines = [];
  selected = [];
  controlPoint = null;
  pendingLine = null;
  curveLocked = false;
  currentPlayer = 1;
  statusP.textContent = "Player 1's turn";
}

function createDots(n) {
  const margin = 40;
  let tries = 0;
  while (dots.length < n && tries < n * 200) {
    const x = margin + Math.random() * (LOGICAL_WIDTH - 2 * margin);
    const y = margin + Math.random() * (LOGICAL_HEIGHT - 2 * margin);
    const tooClose = dots.some(dot => distance(dot, { x, y }) < DOT_RADIUS * 4);
    if (!tooClose) {
      dots.push({ x, y, connections: 0 });
    }
    tries++;
  }
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.onmousedown = (e) => {
  if (gameOver) return;
  const { offsetX: x, offsetY: y } = e;

  if (e.button === 2 && pendingLine) {
    curveLocked = true;
    return;
  }

  if (pendingLine) {
    if (controlPoint && distance({ x, y }, controlPoint) < 10) {
      isDraggingControl = true;
      return;
    }
    return;
  }

  const clickedDot = dots.find(dot => distance(dot, { x, y }) < DOT_RADIUS + 3);
  if (clickedDot && clickedDot.connections < 3 && !selected.includes(clickedDot)) {
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
      statusP.textContent = `Player ${currentPlayer}'s turn: Double-click on the curve to place a new dot.`;
    }
    draw();
  }
};

canvas.onmousemove = (e) => {
  const { offsetX: x, offsetY: y } = e;
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
  isDraggingControl = false;
};

canvas.ondblclick = (e) => {
  const { offsetX: x, offsetY: y } = e;
  if (pendingLine && isNearPath({ x, y }, pendingLine)) {
    completeConnection({ x, y });
  } else if (pendingLine) {
    statusP.textContent = "Double-click on the curve to place a new dot.";
  }
};

document.addEventListener("keydown", (e) => {
  if (e.key === "u" || e.key === "U") {
    undoMove();
  }
});

function undoMove() {
  if (pendingLine && selected.length > 0 && !curveLocked) {
    selected.pop();
    pendingLine = null;
    controlPoint = null;
    statusP.textContent = `Player ${currentPlayer}'s turn: Selection undone.`;
    draw();
  }
}

function completeConnection(dotPos) {
  const [a, b] = selected;
  if (a.connections >= 3 || b.connections >= 3) {
    statusP.textContent = "Invalid move: Dot already has 3 connections.";
    resetSelection();
    return;
  }
  if (intersectsAny(pendingLine)) {
    statusP.textContent = "Invalid move: Line crosses another line.";
    resetSelection();
    return;
  }

  a.connections++;
  if (a !== b) b.connections++;

  const orig = pendingLine;
  const p0 = orig.a;
  const p1 = orig.cp;
  const p2 = orig.b;
  const p01 = midpoint(p0, p1);
  const p12 = midpoint(p1, p2);
  const mid = midpoint(p01, p12);

  const newDot = { x: mid.x, y: mid.y, connections: 2 };
  dots.push(newDot);

  lines.push({ a: p0, b: newDot, cp: p01, type: "curve" });
  lines.push({ a: newDot, b: p2, cp: p12, type: "curve" });

  lastPlayer = currentPlayer;
  currentPlayer = currentPlayer === 1 ? 2 : 1;

  resetSelection();
  draw();

  if (!hasMoves()) {
    gameOver = true;
    statusP.textContent = `Game Over! Player ${lastPlayer} wins! (No valid moves remain)`;
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

function draw() {
  ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  ctx.save();
  for (const line of lines) {
    drawCurve(line.a, line.cp, line.b, "#555", 2);
  }
  if (pendingLine) {
    drawCurve(pendingLine.a, pendingLine.cp, pendingLine.b, "#888", 1, true);
  }
  for (const dot of dots) {
    drawDot(dot);
  }
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

function isSameEndpoints(p1, p2) {
  return distance(p1, p2) < 0.1;
}

function curveIntersectsCurve(c1, c2) {
  const pts1 = [], pts2 = [];
  for (let t = 0; t <= 1; t += 0.02) {
    pts1.push(getCurvePoint(c1.a, c1.cp, c1.b, t));
    pts2.push(getCurvePoint(c2.a, c2.cp, c2.b, t));
  }

  // ✅ Ignore shared endpoints
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
    { x: 30, y: -30 },
    { x: -30, y: 30 },
    { x: 40, y: 0 },
    { x: 0, y: 40 },
    { x: -40, y: 0 },
    { x: 0, y: -40 }
  ];

  for (let i = 0; i < dots.length; i++) {
    const a = dots[i];
    if (a.connections >= 3) continue;

    if (a.connections <= 1) {
      for (const offset of controlOffsets) {
        const cp = { x: a.x + offset.x, y: a.y + offset.y };
        const testSelf = { a, b: a, cp };
        if (!intersectsAny(testSelf)) return true;
      }
    }

    for (let j = i + 1; j < dots.length; j++) {
      const b = dots[j];
      if (b.connections >= 3) continue;

      for (const offset of controlOffsets) {
        const cpMid = midpoint(a, b);
        const cp = { x: cpMid.x + offset.x, y: cpMid.y + offset.y };
        const testLine = { a, b, cp };
        if (!intersectsAny(testLine)) return true;
      }
    }
  }
  return false;
}

// Prevent double-click selection behavior
canvas.addEventListener("dblclick", (e) => {
  e.preventDefault();
});

// Prevent focus highlight on restart button
restartBtn.addEventListener("click", () => {
  restartBtn.blur();
});
