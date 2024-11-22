const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")
const fs = require("fs").promises
const path = require("path")
const config = require("../config")
const progressEmitter = require("./ProgressEmitter")

class StorageService {
	constructor() {
		if (config.r2.isConfigured) {
			this.client = new S3Client({
				region: "auto",
				endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
				credentials: {
					accessKeyId: config.r2.accessKeyId,
					secretAccessKey: config.r2.secretAccessKey,
				},
			})
			this.bucketName = config.r2.bucketName
			this.publicUrl = config.r2.publicUrl
		}
	}

	async uploadDirectory(dirPath, prefix, videoId) {
		const progress = progressEmitter.createProgressHandler(videoId)
		progress.onStart("upload")

		try {
			if (!config.r2.isConfigured) {
				// In development, just return a local URL
				const publicDir = path.join(
					__dirname,
					"..",
					"public",
					"uploads"
				)
				const targetDir = path.join(publicDir, prefix)

				// Create public/uploads directory if it doesn't exist
				await fs.mkdir(publicDir, { recursive: true })

				// Copy the directory to public/uploads with progress
				await this.copyDirectory(dirPath, targetDir, progress)

				progress.onComplete("upload")
				// Return local URL
				return `/uploads/${prefix}`
			}

			const files = await this.getAllFiles(dirPath)
			const totalFiles = files.length
			let uploadedFiles = 0

			const uploads = files.map(async (filePath) => {
				const relativePath = path.relative(dirPath, filePath)
				const key = path.join(prefix, relativePath).replace(/\\/g, "/")
				const content = await fs.readFile(filePath)
				const contentType = this.getContentType(filePath)

				await this.uploadFile(key, content, contentType)
				uploadedFiles++

				const uploadProgress = Math.round(
					(uploadedFiles / totalFiles) * 100
				)
				progress.onProgress("upload", uploadProgress)
			})

			await Promise.all(uploads)
			progress.onComplete("upload")
			return this.getPublicUrl(prefix)
		} catch (error) {
			progress.onError("upload", error)
			throw error
		}
	}

	async uploadFile(key, content, contentType) {
		if (!config.r2.isConfigured) {
			return // Skip R2 upload in development
		}

		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: key,
			Body: content,
			ContentType: contentType,
		})

		await this.client.send(command)
	}

	async copyDirectory(src, dest, progress) {
		await fs.mkdir(dest, { recursive: true })
		const entries = await fs.readdir(src, { withFileTypes: true })
		const totalEntries = entries.length
		let copiedEntries = 0

		for (const entry of entries) {
			const srcPath = path.join(src, entry.name)
			const destPath = path.join(dest, entry.name)

			if (entry.isDirectory()) {
				await this.copyDirectory(srcPath, destPath, progress)
			} else {
				await fs.copyFile(srcPath, destPath)
				copiedEntries++
				const copyProgress = Math.round(
					(copiedEntries / totalEntries) * 100
				)
				progress.onProgress("upload", copyProgress)
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
		if (!config.r2.isConfigured) {
			return `/uploads/${prefix}`
		}
		return `${this.publicUrl}/${prefix}`
	}
}

module.exports = new StorageService()
