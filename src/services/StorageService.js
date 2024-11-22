const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")
const fs = require("fs").promises
const path = require("path")
const config = require("../config")
const https = require("https")

class StorageService {
	constructor() {
		if (config.r2.isConfigured) {
			try {
				// Create HTTPS agent with modern TLS configuration
				const agent = new https.Agent({
					keepAlive: true,
					maxSockets: 50,
					rejectUnauthorized: true,
					secureProtocol: "TLS_method",
					secureOptions:
						require("constants").SSL_OP_NO_SSLv3 |
						require("constants").SSL_OP_NO_TLSv1,
				})

				this.client = new S3Client({
					region: "auto",
					endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
					credentials: {
						accessKeyId: config.r2.accessKeyId,
						secretAccessKey: config.r2.secretAccessKey,
					},
					requestHandler: {
						httpOptions: {
							agent,
						},
					},
					maxAttempts: 3,
					retryMode: "adaptive",
				})
				this.bucketName = config.r2.bucketName
				this.publicUrl = config.r2.publicUrl
				console.log("R2 client initialized successfully")
			} catch (error) {
				console.warn(
					"Failed to initialize R2 client, falling back to local storage:",
					error.message,
					"\nStack:",
					error.stack
				)
				this.client = null
			}
		} else {
			console.log("R2 not configured, using local storage")
			this.client = null
		}
	}

	async uploadDirectory(dirPath, prefix, videoId) {
		try {
			// If R2 is not configured or client initialization failed, use local storage
			if (!this.client) {
				console.log("Using local storage for upload")
				return this.storeLocally(dirPath, prefix)
			}

			console.log(`Starting upload to R2: ${prefix}`)
			const files = await this.getAllFiles(dirPath)
			console.log(`Found ${files.length} files to upload`)

			for (const filePath of files) {
				const relativePath = path.relative(dirPath, filePath)
				const key = path.join(prefix, relativePath).replace(/\\/g, "/")
				const content = await fs.readFile(filePath)
				const contentType = this.getContentType(filePath)

				try {
					console.log(`Uploading ${key} to R2...`)
					await this.uploadFile(key, content, contentType)
					console.log(`Successfully uploaded ${key}`)
				} catch (error) {
					console.error(
						`Failed to upload ${key} to R2, falling back to local storage:`,
						error.message,
						"\nStack:",
						error.stack
					)
					return this.storeLocally(dirPath, prefix)
				}
			}

			console.log(`Upload to R2 completed successfully: ${prefix}`)
			return this.getPublicUrl(prefix)
		} catch (error) {
			console.error(
				"Storage error:",
				error.message,
				"\nStack:",
				error.stack
			)
			// Fall back to local storage on any error
			return this.storeLocally(dirPath, prefix)
		}
	}

	async storeLocally(dirPath, prefix) {
		console.log(`Storing files locally: ${prefix}`)
		const publicDir = path.join(__dirname, "..", "public", "uploads")
		const targetDir = path.join(publicDir, prefix)

		try {
			// Create public/uploads directory if it doesn't exist
			await fs.mkdir(publicDir, { recursive: true })

			// Copy the directory to public/uploads
			await this.copyDirectory(dirPath, targetDir)

			console.log(`Local storage completed: ${prefix}`)
			// Return local URL
			return `/uploads/${prefix}`
		} catch (error) {
			console.error(
				"Local storage error:",
				error.message,
				"\nStack:",
				error.stack
			)
			throw error
		}
	}

	async uploadFile(key, content, contentType) {
		if (!this.client) {
			return
		}

		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: key,
			Body: content,
			ContentType: contentType,
		})

		try {
			await this.client.send(command)
		} catch (error) {
			console.error(`R2 upload error for ${key}:`, error.message)
			throw error
		}
	}

	async copyDirectory(src, dest) {
		await fs.mkdir(dest, { recursive: true })
		const entries = await fs.readdir(src, { withFileTypes: true })

		for (const entry of entries) {
			const srcPath = path.join(src, entry.name)
			const destPath = path.join(dest, entry.name)

			if (entry.isDirectory()) {
				await this.copyDirectory(srcPath, destPath)
			} else {
				await fs.copyFile(srcPath, destPath)
			}
		}
	}

	async getAllFiles(dirPath) {
		const files = []

		async function traverse(currentPath) {
			const entries = await fs.readdir(currentPath, {
				withFileTypes: true,
			})

			for (const entry of entries) {
				const fullPath = path.join(currentPath, entry.name)
				if (entry.isDirectory()) {
					await traverse(fullPath)
				} else {
					files.push(fullPath)
				}
			}
		}

		await traverse(dirPath)
		return files
	}

	getContentType(filePath) {
		const ext = path.extname(filePath).toLowerCase()
		const contentTypes = {
			".m3u8": "application/x-mpegURL",
			".ts": "video/MP2T",
			".mp4": "video/mp4",
		}

		return contentTypes[ext] || "application/octet-stream"
	}

	getPublicUrl(prefix) {
		if (!this.client) {
			return `/uploads/${prefix}`
		}
		return `${this.publicUrl}/${prefix}`
	}
}

module.exports = new StorageService()
