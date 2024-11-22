const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")
const fs = require("fs").promises
const path = require("path")
const config = require("../config")
const https = require("https")

class StorageService {
	constructor() {
		if (config.r2.isConfigured) {
			try {
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

	async uploadDirectory(dirPath, prefix, videoId, progress) {
		try {
			if (!this.client) {
				console.log("Using local storage for upload")
				return this.storeLocally(dirPath, prefix, progress)
			}

			console.log(`Starting upload to R2: ${prefix}`)
			const files = await this.getAllFiles(dirPath)
			console.log(`Found ${files.length} files to upload`)

			let uploadedFiles = 0
			const totalFiles = files.length

			for (const filePath of files) {
				const relativePath = path.relative(dirPath, filePath)
				const key = path.join(prefix, relativePath).replace(/\\/g, "/")
				const content = await fs.readFile(filePath)
				const contentType = this.getContentType(filePath)
				const fileSize = (await fs.stat(filePath)).size

				try {
					console.log(`Uploading ${key} to R2...`)

					// Emit upload start event
					if (progress) {
						progress.onProgress("upload", {
							status: "uploading",
							file: path.basename(filePath),
							progress: Math.round(
								(uploadedFiles / totalFiles) * 100
							),
							totalFiles,
							uploadedFiles,
							currentFile: {
								name: path.basename(filePath),
								size: fileSize,
								type: contentType,
							},
						})
					}

					await this.uploadFile(key, content, contentType)
					uploadedFiles++

					// Emit upload progress event
					if (progress) {
						progress.onProgress("upload", {
							status: "uploading",
							file: path.basename(filePath),
							progress: Math.round(
								(uploadedFiles / totalFiles) * 100
							),
							totalFiles,
							uploadedFiles,
							currentFile: {
								name: path.basename(filePath),
								size: fileSize,
								type: contentType,
							},
						})
					}

					console.log(`Successfully uploaded ${key}`)
				} catch (error) {
					console.error(
						`Failed to upload ${key} to R2, falling back to local storage:`,
						error.message,
						"\nStack:",
						error.stack
					)
					return this.storeLocally(dirPath, prefix, progress)
				}
			}

			// Emit upload complete event
			if (progress) {
				progress.onProgress("upload", {
					status: "completed",
					progress: 100,
					totalFiles,
					uploadedFiles,
				})
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
			return this.storeLocally(dirPath, prefix, progress)
		}
	}

	async storeLocally(dirPath, prefix, progress) {
		console.log(`Storing files locally: ${prefix}`)
		const publicDir = path.join(__dirname, "..", "public", "uploads")
		const targetDir = path.join(publicDir, prefix)

		try {
			await fs.mkdir(publicDir, { recursive: true })

			const files = await this.getAllFiles(dirPath)
			let copiedFiles = 0
			const totalFiles = files.length

			for (const filePath of files) {
				const relativePath = path.relative(dirPath, filePath)
				const destPath = path.join(targetDir, relativePath)
				const destDir = path.dirname(destPath)
				const fileSize = (await fs.stat(filePath)).size

				await fs.mkdir(destDir, { recursive: true })
				await fs.copyFile(filePath, destPath)

				copiedFiles++

				// Emit local storage progress
				if (progress) {
					progress.onProgress("upload", {
						status: "copying",
						file: path.basename(filePath),
						progress: Math.round((copiedFiles / totalFiles) * 100),
						totalFiles,
						copiedFiles,
						currentFile: {
							name: path.basename(filePath),
							size: fileSize,
							type: this.getContentType(filePath),
						},
					})
				}
			}

			// Emit completion event
			if (progress) {
				progress.onProgress("upload", {
					status: "completed",
					progress: 100,
					totalFiles,
					copiedFiles,
				})
			}

			console.log(`Local storage completed: ${prefix}`)
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
