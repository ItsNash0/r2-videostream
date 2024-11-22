const path = require("path")
const fs = require("fs").promises
const videoProcessingService = require("../services/VideoProcessingService")
const storageService = require("../services/StorageService")
const progressEmitter = require("../services/ProgressEmitter")
const databaseService = require("../services/DatabaseService")
const config = require("../config")

class VideoController {
	constructor() {
		// Ensure uploads directories exist
		this.createRequiredDirectories()
	}

	async createRequiredDirectories() {
		const dirs = [
			config.paths.uploads,
			path.join(__dirname, "..", "public", "uploads"),
		]

		for (const dir of dirs) {
			try {
				await fs.mkdir(dir, { recursive: true })
			} catch (error) {
				console.error(`Error creating directory ${dir}:`, error)
			}
		}
	}

	async uploadAndProcess(req, res) {
		let videoId
		try {
			if (!req.file) {
				return res.status(400).json({ error: "No video file provided" })
			}

			if (!req.session.user) {
				return res
					.status(401)
					.json({ error: "Authentication required" })
			}

			videoId = `video_${Date.now()}`
			const progress = progressEmitter.createProgressHandler(videoId)

			// Send initial response with videoId for progress tracking
			res.json({
				success: true,
				videoId,
				status: "processing",
			})

			const inputPath = req.file.path
			const outputDir = path.join(config.paths.uploads, videoId)

			// Process video and generate HLS
			const { hlsDir, masterPlaylistPath } =
				await videoProcessingService.processVideo(
					inputPath,
					outputDir,
					videoId
				)

			// Upload to R2 or store locally
			const r2Prefix = `videos/${videoId}`
			const publicUrl = await storageService.uploadDirectory(
				hlsDir,
				r2Prefix,
				videoId
			)

			// Clean up temporary files
			await fs.unlink(inputPath)

			// In development mode, don't remove the HLS directory if we're serving it locally
			if (config.r2.isConfigured) {
				await fs.rm(hlsDir, { recursive: true, force: true })
			}

			const masterPlaylistUrl = config.r2.isConfigured
				? `${publicUrl}/master.m3u8`
				: `${publicUrl}/master.m3u8`

			// Save video to database
			const videoTitle = req.file.originalname.replace(/\.[^/.]+$/, "") // Remove extension
			await databaseService.addVideo(
				req.session.user.id,
				videoTitle,
				masterPlaylistUrl
			)

			const result = {
				success: true,
				videoId,
				status: "completed",
				masterPlaylistUrl,
				embedCode: this.generateEmbedCode(masterPlaylistUrl),
				mode: config.r2.isConfigured ? "production" : "development",
			}

			// Send completion event
			progress.onComplete("complete")
			progress.onProgress("complete", 100)
			progress.onProgress("result", result)
		} catch (error) {
			console.error("Error processing video:", error)
			if (videoId) {
				const progress = progressEmitter.createProgressHandler(videoId)
				progress.onError("processing", error)
			}
		}
	}

	generateEmbedCode(playlistUrl) {
		return `
<video id="video" controls style="max-width: 100%; height: auto;"></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
  const video = document.getElementById('video');
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource('${playlistUrl}');
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = '${playlistUrl}';
  }
</script>`
	}
}

module.exports = new VideoController()
