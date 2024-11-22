const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")
const https = require("https")
const path = require("path")
const FileUtils = require("./FileUtils")
const BaseStorage = require("./BaseStorage")

class R2Storage extends BaseStorage {
	constructor(config) {
		super()
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
				endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
				credentials: {
					accessKeyId: config.accessKeyId,
					secretAccessKey: config.secretAccessKey,
				},
				requestHandler: {
					httpOptions: { agent },
				},
				maxAttempts: 3,
				retryMode: "adaptive",
			})
			this.bucketName = config.bucketName
			this.publicUrl = config.publicUrl
			console.log("R2 client initialized successfully")
		} catch (error) {
			console.warn("Failed to initialize R2 client:", error)
			throw error
		}
	}

	async uploadDirectory(dirPath, prefix, videoId, progress) {
		console.log(`Starting upload to R2: ${prefix}`)
		const files = await FileUtils.getAllFiles(dirPath)
		console.log(`Found ${files.length} files to upload`)

		let uploadedFiles = 0
		const totalFiles = files.length

		for (const filePath of files) {
			const relativePath = path.relative(dirPath, filePath)
			const key = path.join(prefix, relativePath).replace(/\\/g, "/")
			const content = await FileUtils.readFile(filePath)
			const contentType = FileUtils.getContentType(filePath)
			const fileSize = await FileUtils.getFileSize(filePath)

			try {
				console.log(`Uploading ${key} to R2...`)

				this.emitProgress(progress, {
					status: "uploading",
					file: path.basename(filePath),
					progress: Math.round((uploadedFiles / totalFiles) * 100),
					totalFiles,
					uploadedFiles,
					currentFile: {
						name: path.basename(filePath),
						size: fileSize,
						type: contentType,
					},
				})

				await this.uploadFile(key, content, contentType)
				uploadedFiles++

				this.emitProgress(progress, {
					status: "uploading",
					file: path.basename(filePath),
					progress: Math.round((uploadedFiles / totalFiles) * 100),
					totalFiles,
					uploadedFiles,
					currentFile: {
						name: path.basename(filePath),
						size: fileSize,
						type: contentType,
					},
				})

				console.log(`Successfully uploaded ${key}`)
			} catch (error) {
				console.error(`Failed to upload ${key} to R2:`, error)
				throw error
			}
		}

		this.emitProgress(progress, {
			status: "completed",
			progress: 100,
			totalFiles,
			uploadedFiles,
		})

		console.log(`Upload to R2 completed successfully: ${prefix}`)
		return this.getPublicUrl(prefix)
	}

	async uploadFile(key, content, contentType) {
		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: key,
			Body: content,
			ContentType: contentType,
		})

		try {
			await this.client.send(command)
		} catch (error) {
			console.error(`R2 upload error for ${key}:`, error)
			throw error
		}
	}

	getPublicUrl(prefix) {
		return `${this.publicUrl}/${prefix}`
	}
}

module.exports = R2Storage
