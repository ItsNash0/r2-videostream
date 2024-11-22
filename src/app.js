const express = require("express")
const cors = require("cors")
const path = require("path")
const http = require("http")
const { Server } = require("socket.io")
const session = require("express-session")
const SQLiteStore = require("connect-sqlite3")(session)
const videoRoutes = require("./routes/videoRoutes")
const authRoutes = require("./routes/authRoutes")
const config = require("./config")
const progressEmitter = require("./services/ProgressEmitter")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

// Set up Socket.IO in ProgressEmitter
progressEmitter.setIO(io)

// Make io available throughout the application
app.set("io", io)

// CORS configuration
app.use(
	cors({
		origin: config.clientUrl,
		credentials: true,
	})
)

// Body parsing middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Session configuration
app.use(
	session({
		...config.session,
		store: new SQLiteStore({
			dir: config.paths.data,
			db: "sessions.db",
			table: "sessions",
		}),
	})
)

// Static files
app.use(express.static(path.join(__dirname, "public")))
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")))

// Socket.IO connection handling
io.on("connection", (socket) => {
	console.log("Client connected for progress updates")

	socket.on("disconnect", () => {
		console.log("Client disconnected from progress updates")
	})
})

// Authentication middleware
const requireAuth = (req, res, next) => {
	if (!req.session.user) {
		return res.status(401).json({ error: "Authentication required" })
	}
	next()
}

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/videos", requireAuth, videoRoutes)

// Simple frontend for testing
app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "index.html"))
})

// Error handling middleware
app.use((err, req, res, next) => {
	console.error("Error:", err)
	res.status(500).json({
		error: "Something went wrong!",
		details:
			process.env.NODE_ENV === "development"
				? err.message
				: "Internal server error",
	})
})

// Ensure required directories exist
;[
	config.paths.data,
	config.paths.uploads,
	path.join(__dirname, "public", "uploads"),
].forEach((dir) => {
	require("fs").mkdirSync(dir, { recursive: true })
})

const port = config.server.port

server.listen(port, () => {
	console.log(`Server running on port ${port}`)
	console.log(`Frontend URL: ${config.clientUrl}`)
	console.log(`API endpoint: ${config.clientUrl}/api`)
})

// Handle process termination
process.on("SIGTERM", () => {
	console.log("SIGTERM received. Shutting down gracefully...")
	server.close(() => {
		console.log("Server closed")
		process.exit(0)
	})
})

process.on("SIGINT", () => {
	console.log("SIGINT received. Shutting down gracefully...")
	server.close(() => {
		console.log("Server closed")
		process.exit(0)
	})
})

// Export for potential testing
module.exports = { app, server, io }
