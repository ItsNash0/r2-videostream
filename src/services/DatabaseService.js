const sqlite3 = require("sqlite3").verbose()
const path = require("path")
const crypto = require("crypto")

class DatabaseService {
	constructor() {
		// Ensure data directory exists
		const dataDir = path.join(__dirname, "..", "data")
		require("fs").mkdirSync(dataDir, { recursive: true })

		this.db = new sqlite3.Database(path.join(dataDir, "users.db"))
		this.initDatabase()
	}

	initDatabase() {
		this.db.serialize(() => {
			// Create users table
			this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_number TEXT UNIQUE NOT NULL,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

			// Create videos table
			this.db.run(`
        CREATE TABLE IF NOT EXISTS videos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          title TEXT,
          playlist_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        )
      `)
		})
	}

	generateAccountNumber() {
		// Generate a 12-digit account number
		const prefix = "420" // Custom prefix
		const random = Math.floor(Math.random() * 900000000) + 100000000
		return prefix + random.toString()
	}

	createUser(name) {
		return new Promise((resolve, reject) => {
			const accountNumber = this.generateAccountNumber()

			this.db.run(
				"INSERT INTO users (account_number, name) VALUES (?, ?)",
				[accountNumber, name],
				function (err) {
					if (err) {
						reject(err)
						return
					}

					resolve({
						id: this.lastID,
						accountNumber,
						name,
					})
				}
			)
		})
	}

	getUserByAccountNumber(accountNumber) {
		return new Promise((resolve, reject) => {
			this.db.get(
				"SELECT * FROM users WHERE account_number = ?",
				[accountNumber],
				(err, row) => {
					if (err) {
						reject(err)
						return
					}
					resolve(row)
				}
			)
		})
	}

	addVideo(userId, title, playlistUrl) {
		return new Promise((resolve, reject) => {
			this.db.run(
				"INSERT INTO videos (user_id, title, playlist_url) VALUES (?, ?, ?)",
				[userId, title, playlistUrl],
				function (err) {
					if (err) {
						reject(err)
						return
					}
					resolve({
						id: this.lastID,
						userId,
						title,
						playlistUrl,
					})
				}
			)
		})
	}

	getUserVideos(userId) {
		return new Promise((resolve, reject) => {
			this.db.all(
				"SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC",
				[userId],
				(err, rows) => {
					if (err) {
						reject(err)
						return
					}
					resolve(rows)
				}
			)
		})
	}
}

module.exports = new DatabaseService()
