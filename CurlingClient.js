
/*
COMP 2406 Collision Demo
(c) Louis D. Nel 2018

This example is based on the collision geometry math presented in
assignment #3 (fall 2018).
Some of the variable names (e.g. angle_d) correspond to those
presented in the powerpoint slides with the assignment.

This code is intended to serve as the base code for building
an online multi-player game where clients are kept in synch
through a server -presumably using the socket.io npm module.

*/

// CurlingClient.js

// Establish socket connection with the server
const socket = io()

// Get references to the canvas elements and their 2D rendering contexts
const closeup = document.getElementById("closeupCanvas")
const game = document.getElementById("gameCanvas")
const closeupCtx = closeup.getContext("2d")
const gameCtx = game.getContext("2d")

// Game state variables

// Array of all curling stones
let stones = []

// Roles the user has joined 
let playerRoles = new Set()

// Whose turn it is currently
let currentTurn = null

// Flag to check if an animation is running
let isAnimating = false

// Flag to track if player is aiming
let aiming = false

// Aiming state
let aimStart = null, aimEnd = null, aimStone = null

// Tracks roles already joined to prevent double joining
let joinedRoles = {}

// For any future winner message delay
let winnerMessageTimeout

// Stores the last round loser 
let lastRoundLoser = "visitor"

// Initializes the position and properties of stones
function initStones() 
{
  stones = []
  for (let i = 0; i < 4; i++) 
    {
    stones.push({ id: `home-${i}`, shooter: "home", x: 30, y: 330 - i * 35, vx: 0, vy: 0 })
    stones.push({ id: `visitor-${i}`, shooter: "visitor", x: 170, y: 330 - i * 35, vx: 0, vy: 0 })
  }
  drawAll()
}

// Converts mouse click position to canvas coordinates
function getCanvasMouseLocation(e) 
{
  let rect = closeup.getBoundingClientRect()
  const html = document.documentElement
  let scrollOffsetX = html.scrollLeft
  let scrollOffsetY = html.scrollTop
  let x = e.pageX - rect.left - scrollOffsetX
  let y = e.pageY - rect.top - scrollOffsetY
  return { x, y }
}

// Draws a single stone on both canvases
function drawStone(stone) 
{
  closeupCtx.beginPath()
  closeupCtx.arc(stone.x, stone.y, 10, 0, Math.PI * 2)
  closeupCtx.fillStyle = stone.shooter === "home" ? "red" : "gold"
  closeupCtx.fill()
  closeupCtx.stroke()

  // Draw larger version only if the stone is moving
  if (stone.vx !== 0 || stone.vy !== 0) 
    {
    const scaleX = game.width / closeup.width
    const scaleY = game.height / closeup.height
    const scaledX = stone.x * scaleX
    const scaledY = stone.y * scaleY
    gameCtx.beginPath();
    gameCtx.arc(scaledX, scaledY, 15, 0, Math.PI * 2)
    gameCtx.fillStyle = stone.shooter === "home" ? "red" : "gold"
    gameCtx.fill()
    gameCtx.stroke()
  }
}

// Draws the curling target on a canvas context
function drawFullTarget(ctx, x, y, baseRadius) 
{
  const colors = ['blue', 'white', 'red', 'white']
  const scale = [1, 0.66, 0.33, 0.15]
  for (let i = 0; i < 4; i++) 
    {
    ctx.beginPath()
    ctx.arc(x, y, baseRadius * scale[i], 0, Math.PI * 2)
    ctx.fillStyle = colors[i]
    ctx.fill()
    ctx.stroke()
  }
}

// Draws the line used when aiming a shot
function drawAimingLine() 
{
  if (!aiming || !aimStone) return
  const dx = aimStart.x - aimEnd.x
  const dy = aimStart.y - aimEnd.y
  const fromX = aimStone.x
  const fromY = aimStone.y
  const toX = fromX + dx
  const toY = fromY + dy

  closeupCtx.beginPath()
  closeupCtx.moveTo(fromX, fromY)
  closeupCtx.lineTo(toX, toY)
  closeupCtx.strokeStyle = "black"
  closeupCtx.lineWidth = 2
  closeupCtx.stroke()
}

// Redraws the entire scene including target, stones, aiming line, and turn indicators
function drawAll() 
{
  closeupCtx.clearRect(0, 0, closeup.width, closeup.height)
  gameCtx.clearRect(0, 0, game.width, game.height)

  drawFullTarget(closeupCtx, closeup.width / 2, 100, 60)
  drawFullTarget(gameCtx, game.width / 2, game.height / 2, Math.min(game.width, game.height) / 2)

  stones.forEach(drawStone)
  drawAimingLine()

  // Highlight score panel of joined role
  document.getElementById("homeScore").style.border = playerRoles.has("home") ? "4px solid red" : ""
  document.getElementById("visitorScore").style.border = playerRoles.has("visitor") ? "4px solid gold" : ""

  // Show whose turn it is
  closeupCtx.fillStyle = currentTurn === "home" ? "lightcoral" : "lightyellow"
  closeupCtx.fillRect(0, closeup.height - 20, closeup.width, 20)
  closeupCtx.fillStyle = "black"
  closeupCtx.font = "14px Arial"
  closeupCtx.textAlign = "center"
  closeupCtx.fillText(`TURN: ${currentTurn ? currentTurn.toUpperCase() : 'WAITING'}`, closeup.width / 2, closeup.height - 5)
}

// Animates the movement and collision of stones
function animate() 
{
  let moving = false
  const radius = 10

  for (let i = 0; i < stones.length; i++) 
    {
    const s1 = stones[i]
    
    // Update position
    s1.x += s1.vx
    s1.y += s1.vy
    
    // Apply friction
    s1.vx *= 0.98
    s1.vy *= 0.98

    // Bounce off walls
    if (s1.x - radius < 0 || s1.x + radius > closeup.width) 
      {
      s1.vx = -s1.vx
      s1.x = Math.max(radius, Math.min(closeup.width - radius, s1.x))
    }
    if (s1.y - radius < 0 || s1.y + radius > closeup.height) 
      {
      s1.vy = -s1.vy
      s1.y = Math.max(radius, Math.min(closeup.height - radius, s1.y))
    }

    // Handle collisions with other stones
    for (let j = i + 1; j < stones.length; j++) 
      {
      const s2 = stones[j]
      const dx = s2.x - s1.x
      const dy = s2.y - s1.y
      const dist = Math.hypot(dx, dy)
      if (dist < radius * 2) 
        {
        const nx = dx / dist
        const ny = dy / dist
        const p = (s1.vx - s2.vx) * nx + (s1.vy - s2.vy) * ny
        if (p > 0) continue

        const fx = p * nx
        const fy = p * ny

        s1.vx -= fx
        s1.vy -= fy
        s2.vx += fx
        s2.vy += fy

        const overlap = 2 * radius - dist
        const adjustX = nx * overlap / 2
        const adjustY = ny * overlap / 2
        s1.x -= adjustX
        s1.y -= adjustY
        s2.x += adjustX
        s2.y += adjustY
      }
    }

    // Check if stone is still moving
    if (Math.abs(s1.vx) > 0.1 || Math.abs(s1.vy) > 0.1) moving = true
  }

  // Re render everything
  drawAll() 
  // Sync updated positions with server
  socket.emit("updateStones", stones) 

  if (moving) 
    {
    // Continue animation
    requestAnimationFrame(animate) 
  } else 
  {
    isAnimating = false
    // Ask server to calculate score
    socket.emit("requestScoreCalculation") 
  }
}

// Handle user pressing down on a stone to aim
closeup.addEventListener("mousedown", (e) => 
  {
  if (!playerRoles.has(currentTurn)) return
  if (stones.some(s => Math.abs(s.vx) > 0.1 || Math.abs(s.vy) > 0.1)) return

  const pos = getCanvasMouseLocation(e)
  const candidates = stones.filter((s) => s.shooter === currentTurn && s.vx === 0 && s.vy === 0)
  if (candidates.length === 0) return

  // Find the closest idle stone
  aimStone = candidates.reduce((closest, s) =>
    Math.hypot(s.x - pos.x, s.y - pos.y) < Math.hypot(closest.x - pos.x, closest.y - pos.y) ? s : closest)

  aimStart = pos
  aimEnd = pos
  aiming = true
})

// Update aim direction as the mouse moves
closeup.addEventListener("mousemove", (e) => 
  {
  if (!aiming || !aimStone) return
  aimEnd = getCanvasMouseLocation(e)
  drawAll()
})

// When mouse is released, shoot the stone
closeup.addEventListener("mouseup", () => 
  {
  if (!aiming || !aimStone) return
  const dx = aimStart.x - aimEnd.x
  const dy = aimStart.y - aimEnd.y
  const vx = dx / 10
  const vy = dy / 10

  if (Math.hypot(vx, vy) > 0.2) 
    {
    aimStone.vx = vx
    aimStone.vy = vy
    socket.emit("shootStone", { id: aimStone.id, vx, vy })

    if (!isAnimating) 
      {
      isAnimating = true
      requestAnimationFrame(animate)
    }
  }

  aiming = false
  aimStone = null
  drawAll()
})

// Handle joining as "home" player
document.getElementById("JoinAsHomeButton").addEventListener("click", () => 
  {
  if (!joinedRoles.home) 
    {
    playerRoles.add("home")
    joinedRoles.home = true
    socket.emit("joinRole", "home")
    document.getElementById("status").textContent = "You joined as HOME"
  }
})

// Handle joining as "visitor" player
document.getElementById("JoinAsVisitorButton").addEventListener("click", () => 
  {
  if (!joinedRoles.visitor) 
    {
    playerRoles.add("visitor")
    joinedRoles.visitor = true
    socket.emit("joinRole", "visitor")
    document.getElementById("status").textContent = "You joined as VISITOR"
  }
})

// Handle joining as spectator
document.getElementById("JoinAsSpectatorButton").addEventListener("click", () => 
  {
  playerRoles.clear()
  joinedRoles = {}
  socket.emit("joinRole", "spectator")
  document.getElementById("status").textContent = "You joined as SPECTATOR"
})

// Receive updated stone positions from server
socket.on("syncStones", (serverStones) => 
  {
  stones = serverStones
  drawAll()
})

// Update the score display when server sends new scores
socket.on("updateScores", ({ home, visitor, winner, gameOver, nextTurn }) => 
  {
  document.getElementById("homeScore").textContent = home
  document.getElementById("visitorScore").textContent = visitor
})

// Receive current player status and turn info from server
socket.on("playerStatus", ({ players, turn, available }) => 
  {
  currentTurn = turn
  document.getElementById("JoinAsHomeButton").disabled = !!players.home && !playerRoles.has("home")
  document.getElementById("JoinAsVisitorButton").disabled = !!players.visitor && !playerRoles.has("visitor")
  drawAll()
})

// Initialize the game on page load
initStones()
