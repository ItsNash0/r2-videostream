const ffmpeg = require("fluent-ffmpeg")
const path = require("path")
const fs = require("fs").promises
const os = require("os")
const config = require("../config")
const progressEmitter = require("./ProgressEmitter")

class VideoProcessingService {
	constructor() {
		this.resolutions = config.video.resolutions
		this.segmentDuration = config.video.segmentDuration
		this.platform = os.platform()

		// Determine hardware acceleration support
		this.hwAccel = this.getHardwareAcceleration()
	}

	getHardwareAcceleration() {
		switch (this.platform) {
			case "darwin":
				return "videotoolbox" // macOS
			case "win32":
				return "nvenc" // Windows with NVIDIA
			case "linux":
				return "vaapi" // Linux with VAAPI
			default:
				return null
		}
	}

	calculateBitrateAndBufferSize(height) {
		// Smart bitrate calculation based on resolution
		let bitrate
		if (height >= 1080) {
			bitrate = "5000k"
		} else if (height >= 720) {
			bitrate = "3500k"
		} else if (height >= 480) {
			bitrate = "2500k"
		} else {
			bitrate = "1500k"
		}

		// Buffer size should be 2x bitrate for optimal quality
		const bufsize = parseInt(bitrate) * 2 + "k"
		return { bitrate, bufsize }
	}

	async processVideo(inputPath, outputDir, videoId) {
		const progress = progressEmitter.createProgressHandler(videoId)
		const hlsDir = path.join(outputDir, videoId)

		try {
			await fs.mkdir(hlsDir, { recursive: true })

			// Analyze video
			progress.onStart("analysis")
			const metadata = await this.analyzeVideo(inputPath, progress)
			progress.onComplete("analysis")

			// Create variants
			progress.onStart("transcoding")
			const variants = await this.createVariants(
				inputPath,
				hlsDir,
				metadata,
				progress
			)
			progress.onComplete("transcoding")

			// Generate master playlist
			progress.onStart("playlist")
			const masterPlaylist = this.generateMasterPlaylist(
				variants,
				videoId
			)
			await fs.writeFile(path.join(hlsDir, "master.m3u8"), masterPlaylist)
			progress.onComplete("playlist")

			return {
				hlsDir,
				variants,
				masterPlaylistPath: path.join(hlsDir, "master.m3u8"),
			}
		} catch (error) {
			progress.onError("processing", error)
			throw error
		}
	}

	analyzeVideo(inputPath, progress) {
		return new Promise((resolve, reject) => {
			ffmpeg.ffprobe(inputPath, (err, metadata) => {
				if (err) {
					progress.onError("analysis", err)
					return reject(err)
				}

				const videoStream = metadata.streams.find(
					(s) => s.codec_type === "video"
				)
				resolve({
					duration: metadata.format.duration,
					width: videoStream.width,
					height: videoStream.height,
					bitrate: metadata.format.bit_rate,
					fps: eval(videoStream.r_frame_rate),
				})
			})
		})
	}

	async createVariants(inputPath, outputDir, metadata, progress) {
		const variants = []
		const totalResolutions = this.resolutions.length

		for (let i = 0; i < this.resolutions.length; i++) {
			const height = this.resolutions[i]
			const variantDir = path.join(outputDir, `${height}p`)
			await fs.mkdir(variantDir, { recursive: true })

			const { bitrate, bufsize } =
				this.calculateBitrateAndBufferSize(height)

			const variant = {
				height,
				bandwidth: parseInt(bitrate) * 1000, // Convert to bps for playlist
				playlistPath: path.join(variantDir, "playlist.m3u8"),
			}

			await this.transcodeToHLS(
				inputPath,
				variant.playlistPath,
				height,
				metadata,
				bitrate,
				bufsize,
				(percent) => {
					const overallProgress =
						(i * 100 + percent) / totalResolutions
					progress.onProgress(
						"transcoding",
						Math.round(overallProgress)
					)
				}
			)

			variants.push(variant)
		}

		return variants
	}

	transcodeToHLS(
		inputPath,
		outputPath,
		height,
		metadata,
		bitrate,
		bufsize,
		onProgress
	) {
		return new Promise((resolve, reject) => {
			let lastProgress = 0
			let command = ffmpeg(inputPath)

			// Add hardware acceleration if available
			if (this.hwAccel) {
				switch (this.hwAccel) {
					case "videotoolbox":
						command.videoCodec("h264_videotoolbox")
						break
					case "nvenc":
						command
							.videoCodec("h264_nvenc")
							.addOption("-preset", "p4")
							.addOption("-tune", "hq")
						break
					case "vaapi":
						command
							.videoCodec("h264_vaapi")
							.addOption("-vaapi_device", "/dev/dri/renderD128")
						break
				}
			} else {
				// Software encoding optimizations
				command
					.videoCodec("libx264")
					.addOption("-preset", "veryfast") // Faster encoding
					.addOption("-tune", "film") // Optimize for high-quality video content
					.addOption("-profile:v", "high") // High profile for better quality
					.addOption("-level", "4.1") // Widely compatible level
			}

			// Common optimizations
			command
				.addOption("-b:v", bitrate)
				.addOption("-maxrate", bitrate)
				.addOption("-bufsize", bufsize)
				.addOption("-g", Math.round(metadata.fps * 2)) // GOP size = 2 seconds
				.addOption("-sc_threshold", "0") // Disable scene change detection for consistent quality
				.addOption("-keyint_min", Math.round(metadata.fps)) // Minimum GOP size = 1 second
				.addOption("-movflags", "+faststart") // Enable fast start for web playback
				.addOption("-hls_time", this.segmentDuration)
				.addOption("-hls_list_size", "0")
				.addOption(
					"-hls_segment_filename",
					path.join(path.dirname(outputPath), "segment_%d.ts")
				)
				.addOption("-vf", `scale=-2:${height}`) // Keep aspect ratio
				.addOption("-crf", "23") // Constant Rate Factor for quality control
				.addOption("-threads", "0") // Use all available CPU threads
				.audioCodec("aac")
				.addOption("-b:a", "128k") // Audio bitrate
				.addOption("-ac", "2") // Stereo audio
				.format("hls")
				.output(outputPath)
				.on("progress", (progress) => {
					const percent = progress.percent || 0
					if (percent - lastProgress >= 1) {
						lastProgress = percent
						onProgress(percent)
					}
				})
				.on("end", resolve)
				.on("error", reject)

			command.run()
		})
	}

	generateMasterPlaylist(variants, videoId) {
		let playlist = "#EXTM3U\n"
		playlist += "#EXT-X-VERSION:3\n\n"

		for (const variant of variants) {
			playlist += `#EXT-X-STREAM-INF:BANDWIDTH=${
				variant.bandwidth
			},RESOLUTION=${this.getResolution(variant.height)}\n`
			playlist += `${variant.height}p/playlist.m3u8\n`
		}

		return playlist
	}

	getResolution(height) {
		const aspectRatio = 16 / 9
		const width = Math.round(height * aspectRatio)
		return `${width}x${height}`
	}
}

module.exports = new VideoProcessingService()
