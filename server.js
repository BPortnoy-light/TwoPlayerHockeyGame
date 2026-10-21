/*
(c) 2025 Louis D. Nel
Based on:
https://socket.io
see in particular:
https://socket.io/docs/
https://socket.io/get-started/chat/

Before you run this app first execute
>npm install
to install npm modules dependencies listed in the package.json file
Then launch this server:
>node server.js

To test open several browsers to: http://localhost:3000/curling.html

*/
// Import required modules
const http = require("http") 
const fs = require("fs") 
const path = require("path") 
const socketIo = require("socket.io") 
const url = require("url") 

// Define the server port and the directory containing static files
const PORT = 3000
const ROOT_DIR = "public"

// Create the HTTP server
const server = http.createServer((req, res) => 
  {
  // Parse the request URL
  const parsedUrl = url.parse(req.url)
  
  // Determine the file path to serve (default to curling.html if root path is requested)
  const pathname = `${ROOT_DIR}${parsedUrl.pathname === "/" ? "/curling.html" : parsedUrl.pathname}`

  // Read the requested file
  fs.readFile(pathname, (err, data) => 
    {
    if (err) 
      {
      // If file is not found, return 404
      res.statusCode = 404
      res.end(`File not found: ${pathname}`)
    } else 
    {
      // If found, return file with correct content-type
      res.statusCode = 200
      res.setHeader("Content-Type", getMimeType(pathname))
      res.end(data)
    }
  })
})

// Function to return appropriate content-type based on file extension
function getMimeType(file) 
{
  const ext = path.extname(file)
  const types = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
  }
  return types[ext] || "text/plain"
}

// Initialize Socket.IO on the server
const io = socketIo(server)

// Game state variables

// Array of curling stones
let stones = [] 

// Tracks player socket IDs
let players = 
{
  home: null,
  visitor: null,
} 
// Whose turn it is to play
let turn = "home" 
// Scoreboard
let scores = { home: 0, visitor: 0 } 

// Initializes the game with 4 stones per player
function initStones() 
{
  stones = []
  for (let i = 0; i < 4; i++) 
    {
    stones.push({ id: `home-${i}`, shooter: "home", x: 30, y: 330 - i * 35, vx: 0, vy: 0 })
    stones.push({ id: `visitor-${i}`, shooter: "visitor", x: 170, y: 330 - i * 35, vx: 0, vy: 0 })
  }
}

// Returns which player roles are currently available to join
function getPlayerRoleAvailability() 
{
  return {
    home: players.home === null,
    visitor: players.visitor === null,
  }
}

// Broadcasts the entire game state to all connected clients
function broadcastGameState() 
{
  // Sends current stone positions
  io.emit("syncStones", stones) 
  io.emit("playerStatus", 
    {
    players,
    turn,
    available: getPlayerRoleAvailability(),
  })
  // Sends current scores
  io.emit("updateScores", scores) 
}

// Calculates and updates the score based on closest stones to target
function calculateScore() 
{
  const targetX = 100
  const targetY = 100

  // Calculate distance of each stone from target
  const sorted = stones
    .map(s => (
      {
      shooter: s.shooter,
      dist: Math.hypot(s.x - targetX, s.y - targetY)
    }))
    .sort((a, b) => a.dist - b.dist)

  if (sorted.length === 0) return

  const winner = sorted[0].shooter
  let score = 1

  // Count how many closest stones belong to the same team
  for (let i = 1; i < sorted.length; i++) 
    {
    if (sorted[i].shooter === winner) score++
    else break
  }

  scores[winner] += score
}

// Initialize stones at server start
initStones()

// Handle new client connections
io.on("connection", (socket) => 
  {
  console.log(`Client connected: ${socket.id}`)

  // Default role is spectator
  socket.role = "spectator"

  // Sync initial game state with new client
  socket.emit("syncStones", stones)
  socket.emit("playerStatus", 
    {
    players,
    turn,
    available: getPlayerRoleAvailability(),
  })
  socket.emit("updateScores", scores)

  // Handle role joining requests
  socket.on("joinRole", (role) => 
    {
    if (role === "home" || role === "visitor") 
      {
      if (!players[role]) 
        {
        players[role] = socket.id
        socket.role = role
        console.log(`${socket.id} joined as ${role}`)
      }
    } else 
    {
      socket.role = "spectator"
      console.log(`${socket.id} joined as spectator`)
    }

    broadcastGameState()
  })

  // Handle when a player shoots a stone
  socket.on("shootStone", ({ id, vx, vy }) => 
    {
    const stone = stones.find(s => s.id === id)
    if (!stone) return
    if (stone.shooter !== turn) return
    if (players[turn] !== socket.id) return

    // Set stone velocity
    stone.vx = vx
    stone.vy = vy

    // Switch turn
    turn = turn === "home" ? "visitor" : "home"

    broadcastGameState()
  })

  // Handle stone position updates 
  socket.on("updateStones", (updatedStones) => 
    {
    stones = updatedStones
    io.emit("syncStones", stones)
  })

  // Handle score calculation request 
  socket.on("requestScoreCalculation", () => 
    {
    calculateScore()
    io.emit("updateScores", scores)
  })

  // Handle player disconnection
  socket.on("disconnect", () => 
    {
    console.log(`Client disconnected: ${socket.id}`)
    if (players.home === socket.id) players.home = null
    if (players.visitor === socket.id) players.visitor = null
    broadcastGameState()
  })
})

// Start the server
server.listen(PORT, () => 
  {
  console.log(`Server running at http://localhost:${PORT}/curling.html`)
})
