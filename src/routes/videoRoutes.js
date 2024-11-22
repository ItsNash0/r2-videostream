const express = require("express")
const multer = require("multer")
const path = require("path")
const config = require("../config")
const videoController = require("../controllers/VideoController")

const router = express.Router()

// Configure multer for video upload
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, config.paths.uploads)
	},
	filename: (req, file, cb) => {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
		cb(null, uniqueSuffix + path.extname(file.originalname))
	},
})

const upload = multer({
	storage,
	limits: {
		fileSize: config.video.maxFileSize,
	},
	fileFilter: (req, file, cb) => {
		const allowedTypes = [".mp4", ".mov", ".avi", ".mkv"]
		const ext = path.extname(file.originalname).toLowerCase()

		if (allowedTypes.includes(ext)) {
			cb(null, true)
		} else {
			cb(new Error("Invalid file type. Only video files are allowed."))
		}
	},
})

router.post(
	"/upload",
	upload.single("video"),
	videoController.uploadAndProcess.bind(videoController)
)

module.exports = router
