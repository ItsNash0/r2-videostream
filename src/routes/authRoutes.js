const express = require("express")
const router = express.Router()
const databaseService = require("../services/DatabaseService")

// Register a new user
router.post("/register", async (req, res) => {
	try {
		const { name } = req.body

		if (!name) {
			return res.status(400).json({ error: "Name is required" })
		}

		const user = await databaseService.createUser(name)

		res.json({
			success: true,
			message: "Account created successfully. Save your account number!",
			user: {
				name: user.name,
				accountNumber: user.accountNumber,
			},
		})
	} catch (error) {
		console.error("Registration error:", error)
		res.status(500).json({ error: "Failed to create account" })
	}
})

// Login with account number
router.post("/login", async (req, res) => {
	try {
		const { accountNumber } = req.body

		if (!accountNumber) {
			return res.status(400).json({ error: "Account number is required" })
		}

		const user = await databaseService.getUserByAccountNumber(accountNumber)

		if (!user) {
			return res.status(401).json({ error: "Invalid account number" })
		}

		// Set user session
		req.session.user = {
			id: user.id,
			name: user.name,
			accountNumber: user.account_number,
		}

		res.json({
			success: true,
			user: {
				name: user.name,
				accountNumber: user.account_number,
			},
		})
	} catch (error) {
		console.error("Login error:", error)
		res.status(500).json({ error: "Failed to login" })
	}
})

// Get current user
router.get("/me", (req, res) => {
	if (!req.session.user) {
		return res.status(401).json({ error: "Not authenticated" })
	}

	res.json({
		success: true,
		user: req.session.user,
	})
})

// Logout
router.post("/logout", (req, res) => {
	req.session.destroy()
	res.json({ success: true })
})

// Get user's videos
router.get("/videos", async (req, res) => {
	try {
		if (!req.session.user) {
			return res.status(401).json({ error: "Not authenticated" })
		}

		const videos = await databaseService.getUserVideos(req.session.user.id)

		res.json({
			success: true,
			videos,
		})
	} catch (error) {
		console.error("Error fetching videos:", error)
		res.status(500).json({ error: "Failed to fetch videos" })
	}
})

module.exports = router
