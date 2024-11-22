const dotenv = require("dotenv")
dotenv.config()

const config = {
	server: {
		port: process.env.PORT || 3000,
	},
	r2: {
		accountId: process.env.R2_ACCOUNT_ID,
		accessKeyId: process.env.R2_ACCESS_KEY_ID,
		secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
		bucketName: process.env.R2_BUCKET_NAME,
		publicUrl: process.env.R2_PUBLIC_URL,
		// Flag to check if R2 is configured
		isConfigured: !!(
			process.env.R2_ACCOUNT_ID &&
			process.env.R2_ACCESS_KEY_ID &&
			process.env.R2_SECRET_ACCESS_KEY &&
			process.env.R2_BUCKET_NAME &&
			process.env.R2_PUBLIC_URL
		),
	},
	video: {
		maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "500000000", 10), // 500MB default
		segmentDuration: parseInt(process.env.SEGMENT_DURATION || "5", 10),
		resolutions: (process.env.VIDEO_RESOLUTIONS || "1080,720,480,360")
			.split(",")
			.map((res) => parseInt(res, 10)),
		// Video processing settings
		encoding: {
			// Audio settings
			audio: {
				codec: "aac",
				bitrate: "128k",
				channels: 2,
			},
			// Video quality settings
			quality: {
				// Constant Rate Factor (18-28, lower = better quality)
				crf: parseInt(process.env.VIDEO_CRF || "23", 10),
				// GOP size in seconds
				gopSize: 2,
				// Preset (ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow)
				preset: process.env.VIDEO_PRESET || "veryfast",
				// Profile (baseline, main, high)
				profile: "high",
				// Level (3.0, 3.1, 4.0, 4.1, etc.)
				level: "4.1",
			},
			// Bitrates for different resolutions (in kbps)
			bitrates: {
				1080: "5000k",
				720: "3500k",
				480: "2500k",
				360: "1500k",
			},
		},
	},
	paths: {
		uploads: "uploads/temp",
	},
}

module.exports = config
