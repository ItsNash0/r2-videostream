const express = require("express")
const cors = require("cors")
const path = require("path")
const http = require("http")
const { Server } = require("socket.io")
const videoRoutes = require("./routes/videoRoutes")
const config = require("./config")
const progressEmitter = require("./services/ProgressEmitter")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

// Set up Socket.IO in ProgressEmitter
progressEmitter.setIO(io)

// Make io available throughout the application
app.set("io", io)

// Socket.IO connection handling
io.on("connection", (socket) => {
	console.log("Client connected for progress updates")

	socket.on("disconnect", () => {
		console.log("Client disconnected from progress updates")
	})
})

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "public", "uploads")
require("fs").mkdirSync(uploadsDir, { recursive: true })

// Routes
app.use("/api/videos", videoRoutes)

// Simple frontend for testing
app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "index.html"))
})

// Error handling middleware
app.use((err, req, res, next) => {
	console.error(err.stack)
	res.status(500).json({
		error: "Something went wrong!",
		details: err.message,
	})
})

const port = config.server.port

server.listen(port, () => {
	console.log(`Server running on port ${port}`)
	console.log(`Upload endpoint: http://localhost:${port}/api/videos/upload`)
	console.log(`Frontend: http://localhost:${port}`)
})

// Export for potential testing
module.exports = { app, server, io }
