const Database = require("better-sqlite3")
const path = require("path")

const db = new Database(path.join(__dirname, "database.sqlite"))

// Initialize database tables
function initializeDatabase() {
	// Users table
	db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `)

	// Videos table
	db.exec(`
        CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            video_id TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL,
            progress INTEGER DEFAULT 0,
            streams TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    `)
}

// Initialize the database
initializeDatabase()

// Prepare statements
const statements = {
	createUser: db.prepare("INSERT INTO users (username) VALUES (?)"),
	getUserById: db.prepare("SELECT * FROM users WHERE id = ?"),
	getUserByUsername: db.prepare("SELECT * FROM users WHERE username = ?"),
	createVideo: db.prepare(
		"INSERT INTO videos (user_id, video_id, title, status) VALUES (?, ?, ?, ?)"
	),
	updateVideoStatus: db.prepare(
		"UPDATE videos SET status = ?, progress = ? WHERE video_id = ?"
	),
	updateVideoStreams: db.prepare(
		"UPDATE videos SET streams = ?, status = ? WHERE video_id = ?"
	),
	getUserVideos: db.prepare(
		"SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC"
	),
	getVideo: db.prepare("SELECT * FROM videos WHERE video_id = ?"),
}

module.exports = {
	// User operations
	createUser: (username) => {
		try {
			const result = statements.createUser.run(username)
			if (result.changes > 0) {
				return statements.getUserByUsername.get(username)
			}
			return null
		} catch (error) {
			if (error.code === "SQLITE_CONSTRAINT") {
				return null
			}
			throw error
		}
	},

	getUser: (identifier) => {
		if (typeof identifier === "number") {
			return statements.getUserById.get(identifier)
		} else {
			return statements.getUserByUsername.get(identifier)
		}
	},

	// Video operations
	createVideo: (userId, videoId, title) => {
		return statements.createVideo.run(userId, videoId, title, "uploading")
	},

	updateVideoStatus: (videoId, status, progress) => {
		return statements.updateVideoStatus.run(status, progress, videoId)
	},

	updateVideoStreams: (videoId, streams) => {
		return statements.updateVideoStreams.run(
			JSON.stringify(streams),
			"completed",
			videoId
		)
	},

	getUserVideos: (userId) => {
		return statements.getUserVideos.all(userId)
	},

	getVideo: (videoId) => {
		return statements.getVideo.get(videoId)
	},
}
