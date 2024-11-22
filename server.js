const express = require("express")
const fileUpload = require("express-fileupload")
const ffmpeg = require("fluent-ffmpeg")
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")
const fs = require("fs")
const path = require("path")
const http = require("http")
const { Server } = require("socket.io")
const session = require("express-session")
const exphbs = require("express-handlebars")
const db = require("./database")
require("dotenv").config()

const app = express()
const server = http.createServer(app)
const io = new Server(server)
const port = 3000

// Configure Handlebars
const hbs = exphbs.create({
	defaultLayout: false,
	extname: ".html",
	helpers: {
		eq: function (a, b) {
			return a === b
		},
		formatDate: function (date) {
			return new Date(date).toLocaleDateString("en-US", {
				year: "numeric",
				month: "long",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			})
		},
	},
})

app.engine("html", hbs.engine)
app.set("view engine", "html")
app.set("views", path.join(__dirname, "views/templates"))

// Serve static files
app.use(express.static(path.join(__dirname, "views")))

// Session middleware
app.use(
	session({
		secret: "your-secret-key",
		resave: false,
		saveUninitialized: true,
		cookie: { secure: false },
	})
)

// File upload middleware
app.use(
	fileUpload({
		useTempFiles: true,
		tempFileDir: "/tmp/",
		debug: true,
	})
)

// Parse JSON bodies
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Configure R2 client
const s3Client = new S3Client({
	region: "auto",
	endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: {
		accessKeyId: process.env.R2_ACCESS_KEY_ID,
		secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
	},
})

// Ensure directories exist
const dirs = ["uploads", "processed", "chunks"]
dirs.forEach((dir) => {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir)
	}
})

// Socket.IO connection handling
const userSockets = new Map()
const uploadSessions = new Map()

io.on("connection", (socket) => {
	console.log("Client connected:", socket.id)

	socket.on("authenticate", (userId) => {
		userSockets.set(parseInt(userId), socket.id)
		console.log(`User ${userId} authenticated with socket ${socket.id}`)
	})

	socket.on("disconnect", () => {
		for (const [userId, socketId] of userSockets.entries()) {
			if (socketId === socket.id) {
				userSockets.delete(userId)
				console.log(`User ${userId} disconnected`)
				break
			}
		}
	})
})

// Helper function to create master playlist
function createMasterPlaylist(videoId, streams) {
	const masterPlaylist =
		"#EXTM3U\n" +
		"#EXT-X-VERSION:3\n" +
		streams
			.map((stream) => {
				const resolution = stream.resolution.split("x")
				return (
					`#EXT-X-STREAM-INF:BANDWIDTH=${
						resolution[0] * 1000
					},RESOLUTION=${stream.resolution}\n` +
					`${stream.resolution}/playlist.m3u8`
				)
			})
			.join("\n")

	const masterPlaylistPath = path.join("processed", `${videoId}_master.m3u8`)
	fs.writeFileSync(masterPlaylistPath, masterPlaylist)
	return masterPlaylistPath
}

// Helper function to create HLS segments
async function createHLSStream(inputPath, outputPath, resolution, videoId) {
	return new Promise((resolve, reject) => {
		ffmpeg(inputPath)
			.outputOptions([
				"-profile:v baseline",
				"-level 3.0",
				"-start_number 0",
				"-hls_time 10",
				"-hls_list_size 0",
				"-f hls",
			])
			.videoCodec("libx264")
			.size(resolution)
			.output(outputPath)
			.on("progress", (progress) => {
				const percent = Math.round(progress.percent)
				db.updateVideoStatus(videoId, "processing", percent)

				const video = db.getVideo(videoId)
				const socketId = userSockets.get(video.user_id)
				if (socketId) {
					io.to(socketId).emit("processingProgress", {
						videoId,
						resolution,
						percent,
						timemark: progress.timemark,
					})
				}
			})
			.on("end", resolve)
			.on("error", reject)
			.run()
	})
}

// Helper function to upload file to R2
async function uploadToR2(filePath, key, videoId) {
	try {
		const fileContent = fs.readFileSync(filePath)
		const command = new PutObjectCommand({
			Bucket: process.env.R2_BUCKET_NAME,
			Key: key,
			Body: fileContent,
			ContentType: "application/x-mpegURL",
		})

		const video = db.getVideo(videoId)
		const socketId = userSockets.get(video.user_id)
		if (socketId) {
			io.to(socketId).emit("uploadProgress", {
				videoId,
				key,
				status: "uploading",
			})
		}

		await s3Client.send(command)
		return `${process.env.R2_PUBLIC_URL}/${key}`
	} catch (error) {
		throw error
	}
}

// Authentication middleware
function requireAuth(req, res, next) {
	if (!req.session.userId) {
		return res.redirect("/login")
	}

	const user = db.getUser(req.session.userId)
	if (!user) {
		return res.redirect("/login")
	}

	req.user = user
	next()
}

// Routes
app.get("/login", (req, res) => {
	if (req.session.userId) {
		return res.redirect("/")
	}

	res.render("login")
})

app.post("/login", (req, res) => {
	const { username } = req.body
	let user = db.getUser(username)

	if (!user) {
		const result = db.createUser(username)
		if (!result) {
			return res.status(400).json({ error: "Username already taken" })
		}
		user = db.getUser(username)
	}

	req.session.userId = user.id
	res.redirect("/")
})

app.get("/logout", (req, res) => {
	req.session.destroy()
	res.redirect("/login")
})

// Main application routes
app.get("/", requireAuth, (req, res) => {
	const videos = db.getUserVideos(req.session.userId)
	const processedVideos = videos.map((video) => ({
		...video,
		completed: video.status === "completed",
		streams: video.streams ? JSON.parse(video.streams) : null,
	}))

	res.render("dashboard", {
		username: req.user.username,
		userId: req.user.id,
		videos: processedVideos,
	})
})

// Chunked upload routes
app.post("/init-upload", requireAuth, async (req, res) => {
	const { filename, title, size, videoId } = req.body

	try {
		// Create upload session
		uploadSessions.set(videoId, {
			filename,
			size,
			receivedChunks: 0,
			userId: req.session.userId,
		})

		// Create video record
		db.createVideo(req.session.userId, videoId, title)

		res.json({ videoId })
	} catch (error) {
		console.error("Error initializing upload:", error)
		res.status(500).json({ error: "Failed to initialize upload" })
	}
})

app.post("/upload-chunk", requireAuth, async (req, res) => {
	if (!req.files || !req.files.chunk) {
		return res.status(400).json({ error: "No chunk uploaded" })
	}

	const { start, videoId, total } = req.body
	const chunk = req.files.chunk
	const session = uploadSessions.get(videoId)

	if (!session) {
		return res.status(400).json({ error: "Invalid upload session" })
	}

	try {
		// Create chunks directory for this video if it doesn't exist
		const videoChunksDir = path.join("chunks", videoId)
		if (!fs.existsSync(videoChunksDir)) {
			fs.mkdirSync(videoChunksDir)
		}

		// Save chunk
		const chunkPath = path.join(videoChunksDir, `${start}`)
		await chunk.mv(chunkPath)

		session.receivedChunks += chunk.size

		// If this was the last chunk, combine them
		if (session.receivedChunks >= session.size) {
			const outputPath = path.join("uploads", videoId)
			const writeStream = fs.createWriteStream(outputPath)

			// Combine chunks
			const files = fs
				.readdirSync(videoChunksDir)
				.sort((a, b) => parseInt(a) - parseInt(b))
			for (const file of files) {
				const chunkContent = fs.readFileSync(
					path.join(videoChunksDir, file)
				)
				writeStream.write(chunkContent)
			}
			writeStream.end()

			// Clean up chunks
			fs.rmSync(videoChunksDir, { recursive: true, force: true })

			// Start processing
			const resolutions = ["640x360", "854x480", "1280x720"]
			const playlistUrls = []

			for (const resolution of resolutions) {
				const outputPath = path.join(
					"processed",
					`${videoId}_${resolution}.m3u8`
				)
				await createHLSStream(
					path.join("uploads", videoId),
					outputPath,
					resolution,
					videoId
				)

				const r2Key = `videos/${videoId}/${resolution}/playlist.m3u8`
				const url = await uploadToR2(outputPath, r2Key, videoId)
				playlistUrls.push({ resolution, url })

				const segmentFiles = fs
					.readdirSync(path.dirname(outputPath))
					.filter(
						(file) =>
							file.startsWith(`${videoId}_${resolution}`) &&
							file.endsWith(".ts")
					)

				for (const segment of segmentFiles) {
					const segmentPath = path.join("processed", segment)
					const segmentKey = `videos/${videoId}/${resolution}/${segment}`
					await uploadToR2(segmentPath, segmentKey, videoId)
				}
			}

			// Create and upload master playlist
			const masterPlaylistPath = createMasterPlaylist(
				videoId,
				playlistUrls
			)
			const masterPlaylistKey = `videos/${videoId}/master.m3u8`
			const masterPlaylistUrl = await uploadToR2(
				masterPlaylistPath,
				masterPlaylistKey,
				videoId
			)

			// Add master playlist URL to the streams
			playlistUrls.push({
				resolution: "master",
				url: masterPlaylistUrl,
			})

			// Update video record with streams
			db.updateVideoStreams(videoId, playlistUrls)

			// Cleanup
			fs.unlinkSync(path.join("uploads", videoId))
			fs.rmSync("processed", { recursive: true, force: true })
			fs.mkdirSync("processed")

			uploadSessions.delete(videoId)
		}

		res.json({
			received: session.receivedChunks,
			total: session.size,
		})
	} catch (error) {
		console.error("Error handling chunk:", error)
		res.status(500).json({ error: "Failed to handle chunk" })
	}
})

server.listen(port, () => {
	console.log(`Server running at http://localhost:${port}`)
})
