const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const statusP = document.getElementById("status");
const dotCountInput = document.getElementById("dotCount");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const shapeSelect = document.getElementById("boardShape");
const sizeSelect = document.getElementById("boardSize");
const lineCurvePopup = document.getElementById("lineCurveChoice");

let dots = [], lines = [], selected = [], currentPlayer = 1;
let boardShape = "square", controlPoint = null, isDraggingControl = false;
let drawMode = "line", awaitingNewDotClick = false, pendingLine = null;
let curveLocked = false, lastPlayer = null;
let gameOver = false;
let hoverDot = null;



startBtn.onclick = () => {
  gameOver = false;
  setupBoard();
  createDots(parseInt(dotCountInput.value));
  draw();
};

restartBtn.onclick = () => {
  gameOver = false;
  setupBoard();
  createDots(parseInt(dotCountInput.value));
  draw();
};

function setupBoard() {
  const size = sizeSelect.value;
  canvas.width = size === "small" ? 400 : size === "large" ? 800 : 600;
  canvas.height = size === "small" ? 400 : 600;
  boardShape = shapeSelect.value;
  dots = [];
  lines = [];
  selected = [];
  controlPoint = null;
  pendingLine = null;
  awaitingNewDotClick = false;
  curveLocked = false;
  currentPlayer = 1;
  statusP.textContent = "Player 1's turn";
}

function createDots(n) {
  const margin = 40;
  let tries = 0;
  while (dots.length < n && tries < n * 100) {
    const x = margin + Math.random() * (canvas.width - 2 * margin);
    const y = margin + Math.random() * (canvas.height - 2 * margin);
    if (inShape(x, y)) dots.push({ x, y, connections: 0 });
    tries++;
  }
}

function inShape(x, y) {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const w = canvas.width * 0.9 / 2, h = canvas.height * 0.9 / 2;
  if (boardShape === "circle") return (x - cx) ** 2 + (y - cy) ** 2 <= Math.min(w, h) ** 2;
  if (boardShape === "oval") return ((x - cx) / w) ** 2 + ((y - cy) / h) ** 2 <= 1;
  return true;
}


canvas.onmousedown = (e) => {
  if (gameOver) return;

  const { offsetX: x, offsetY: y } = e;
  if (!inShape(x, y)) return;

  if (awaitingNewDotClick && pendingLine) {
    if (controlPoint && distance({ x, y }, controlPoint) < 10) {
      isDraggingControl = true;
      return;
    }
    curveLocked = true;
    return;
  }

  const clickedDot = dots.find(dot => distance(dot, { x, y }) < 15);
  if (clickedDot) {
    if (clickedDot.connections >= 3) {
      statusP.textContent = "This dot has 3 connections and cannot be used.";
      return;
    }
    if (!selected.includes(clickedDot)) selected.push(clickedDot);
    if (selected.length === 2) showLineCurveChoice();
  }
};

canvas.onmousemove = (e) => {
  const { offsetX: x, offsetY: y } = e;
  hoverDot = dots.find(dot => distance(dot, { x, y }) < 15) || null;

  if (isDraggingControl && controlPoint) {
    controlPoint.x = x;
    controlPoint.y = y;
    pendingLine.cp = { ...controlPoint };
    draw();
  } else if (awaitingNewDotClick && pendingLine && pendingLine.type === "curve" && !curveLocked) {
    controlPoint.x = x;
    controlPoint.y = y;
    pendingLine.cp = { ...controlPoint };
    draw();
  } else if (awaitingNewDotClick && pendingLine && pendingLine.type === "line") {
    draw();
  } else {
    draw();
  }
};

canvas.onmouseup = () => {
  isDraggingControl = false;
};

canvas.ondblclick = (e) => {
  const { offsetX: x, offsetY: y } = e;
  if (!inShape(x, y)) return;
  if (awaitingNewDotClick && pendingLine && isNearPath({ x, y }, pendingLine)) {
    completeConnection({ x, y });
  } else if (awaitingNewDotClick) {
    statusP.textContent = "Double-click near the path to place the new dot.";
  }
};

function showLineCurveChoice() {
  lineCurvePopup.classList.remove("hidden");
}

function chooseType(type) {
  lineCurvePopup.classList.add("hidden");
  drawMode = type;
  curveLocked = false;
  if (drawMode === "curve") {
    const mid = midpoint(selected[0], selected[1]);
    controlPoint = { x: mid.x + 30, y: mid.y - 30 };
  } else {
    controlPoint = null;
  }
  pendingLine = {
    a: selected[0],
    b: selected[1],
    type: drawMode,
    cp: controlPoint ? { ...controlPoint } : null
  };
  awaitingNewDotClick = true;
  draw();
  statusP.textContent = `Player ${currentPlayer}'s turn: Double-click on the ${drawMode} to place a new dot.`;
}

function completeConnection(dotPos) {
  const [a, b] = selected;
  if (a.connections >= 3 || b.connections >= 3) {
    statusP.textContent = "Invalid move: Dot already has 3 connections.";
    resetSelection();
    return;
  }

  const testLine = {
    a, b,
    type: drawMode,
    cp: drawMode === "curve" ? { ...controlPoint } : null
  };

  if (intersectsAny(testLine)) {
    statusP.textContent = "Invalid move: Line crosses another line.";
    resetSelection();
    return;
  }

  if (!inShape(dotPos.x, dotPos.y)) {
    statusP.textContent = "Invalid move: Dot must be inside the board!";
    resetSelection();
    return;
  }

  a.connections++;
  if (a !== b) b.connections++;
  lines.push(testLine);
  dots.push({ x: dotPos.x, y: dotPos.y, connections: 2 });
  lastPlayer = currentPlayer;
  currentPlayer = currentPlayer === 1 ? 2 : 1;
  resetSelection();
  draw();

  if (!hasMoves()) {
  gameOver = true; // ← Add this line
  statusP.textContent = `Game Over! Player ${lastPlayer} wins!`;
  } else {
  statusP.textContent = `Player ${currentPlayer}'s turn`;
  }

}
function intersectsAny(newLine) {
  return lines.some(line => checkIntersection(line, newLine));
}

function checkIntersection(line1, line2) {
  if (line1.type === "line" && line2.type === "line") {
    return linesIntersect(line1.a, line1.b, line2.a, line2.b);
  }
  if (line1.type === "curve" && line2.type === "line") {
    return curveIntersectsLine(line1.a, line1.cp, line1.b, line2.a, line2.b);
  }
  if (line1.type === "line" && line2.type === "curve") {
    return curveIntersectsLine(line2.a, line2.cp, line2.b, line1.a, line1.b);
  }
  if (line1.type === "curve" && line2.type === "curve") {
    return curveIntersectsCurve(line1, line2);
  }
  return false;
}

function curveIntersectsCurve(c1, c2) {
  const points1 = [];
  const points2 = [];

  for (let t = 0; t <= 1; t += 0.02) {
    points1.push(getCurvePoint(c1.a, c1.cp, c1.b, t));
    points2.push(getCurvePoint(c2.a, c2.cp, c2.b, t));
  }

  for (let i = 0; i < points1.length - 1; i++) {
    const a1 = points1[i];
    const a2 = points1[i + 1];
    for (let j = 0; j < points2.length - 1; j++) {
      const b1 = points2[j];
      const b2 = points2[j + 1];
      if (linesIntersect(a1, a2, b1, b2)) return true;
    }
  }

  return false;
}



function curveIntersectsLine(a, cp, b, p1, p2) {
  const curvePoints = [];
  for (let t = 0; t <= 1; t += 0.02) {
    curvePoints.push(getCurvePoint(a, cp, b, t));
  }

  for (let i = 0; i < curvePoints.length - 1; i++) {
    const c1 = curvePoints[i];
    const c2 = curvePoints[i + 1];
    if (linesIntersect(c1, c2, p1, p2)) return true;
  }

  return false;
}

function linesIntersect(p1, p2, q1, q2) {
  function ccw(a, b, c) {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  }
  return ccw(p1, q1, q2) !== ccw(p2, q1, q2) && ccw(p1, p2, q1) !== ccw(p1, p2, q2);
}

function getCurvePoint(a, cp, b, t) {
  const x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cp.x + t ** 2 * b.x;
  const y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cp.y + t ** 2 * b.y;
  return { x, y };
}

function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return distance(p, proj);
}

function resetSelection() {
  selected = [];
  controlPoint = null;
  pendingLine = null;
  awaitingNewDotClick = false;
  curveLocked = false;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();

  ctx.beginPath();
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const w = canvas.width * 0.9, h = canvas.height * 0.9;
  if (boardShape === "circle") ctx.arc(cx, cy, Math.min(w, h) / 2, 0, 2 * Math.PI);
  else if (boardShape === "oval") ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, 2 * Math.PI);
  else ctx.rect((canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  ctx.clip();

  for (const l of lines) {
    ctx.beginPath();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 2;
    if (l.type === "line") {
      ctx.moveTo(l.a.x, l.a.y);
      ctx.lineTo(l.b.x, l.b.y);
    } else {
      ctx.moveTo(l.a.x, l.a.y);
      ctx.quadraticCurveTo(l.cp.x, l.cp.y, l.b.x, l.b.y);
    }
    ctx.stroke();
  }

  if (pendingLine) {
    ctx.beginPath();
    ctx.strokeStyle = "#888";
    ctx.setLineDash([5, 5]);
    if (pendingLine.type === "line") {
      ctx.moveTo(pendingLine.a.x, pendingLine.a.y);
      ctx.lineTo(pendingLine.b.x, pendingLine.b.y);
    } else {
      ctx.moveTo(pendingLine.a.x, pendingLine.a.y);
      ctx.quadraticCurveTo(pendingLine.cp.x, pendingLine.cp.y, pendingLine.b.x, pendingLine.b.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const dot of dots) {
    ctx.beginPath();
    let color = "#67c2ff";
  if (dot.connections >= 3) color = "#f26d6d"; // red for used dot
  else if (selected.includes(dot)) color = "#00cc99";

    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.arc(dot.x, dot.y, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0;

   if (hoverDot && hoverDot === dot && !selected.includes(dot) && dot.connections < 3) {
  ctx.beginPath();
  ctx.strokeStyle = "#00ccff";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#00ccff";
  ctx.shadowBlur = 10;
  ctx.arc(dot.x, dot.y, 14, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.shadowBlur = 0;
  }

    if (selected.includes(dot)) {
    ctx.beginPath();
    ctx.strokeStyle = "#00cc99";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#00cc99";
    ctx.shadowBlur = 10;
    ctx.arc(dot.x, dot.y, 14, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  }

  if (controlPoint) {
    ctx.beginPath();
    ctx.fillStyle = "orange";
    ctx.arc(controlPoint.x, controlPoint.y, 6, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.restore();
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isNearPath(p, line) {
  if (line.type === "line") {
    const a = line.a, b = line.b;
    const length = distance(a, b);
    const d = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x) / length;
    return d <= 5;
  } else {
    for (let t = 0; t <= 1; t += 0.02) {
      const x = (1 - t) ** 2 * line.a.x + 2 * (1 - t) * t * line.cp.x + t ** 2 * line.b.x;
      const y = (1 - t) ** 2 * line.a.y + 2 * (1 - t) * t * line.cp.y + t ** 2 * line.b.y;
     if (distance(p, { x, y }) < 5) return true;
    }
    return false;
  }
}

function hasMoves() {
  for (let i = 0; i < dots.length; i++) {
    for (let j = i; j < dots.length; j++) {
      const a = dots[i];
      const b = dots[j];

      if (a.connections >= 3 || b.connections >= 3) continue;

      // Try straight line
      const testLine = {
        a, b,
        type: "line",
        cp: null
      };

      if (!intersectsAny(testLine)) return true;

      // Try curve with estimated control point
      const mid = midpoint(a, b);
      const cp = { x: mid.x + 30, y: mid.y - 30 };
      const testCurve = {
        a, b,
        type: "curve",
        cp
      };

      if (!intersectsAny(testCurve)) return true;
    }
  }
  return false;
}
