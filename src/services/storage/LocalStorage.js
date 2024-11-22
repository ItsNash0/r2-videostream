const path = require("path")
const fs = require("fs").promises
const FileUtils = require("./FileUtils")
const BaseStorage = require("./BaseStorage")

class LocalStorage extends BaseStorage {
	constructor(baseDir) {
		super()
		this.baseDir = path.join(baseDir, "public", "uploads")
	}

	async uploadDirectory(dirPath, prefix, videoId, progress) {
		console.log(`Storing files locally: ${prefix}`)
		const targetDir = path.join(this.baseDir, prefix)

		try {
			await FileUtils.ensureDir(this.baseDir)

			const files = await FileUtils.getAllFiles(dirPath)
			let copiedFiles = 0
			const totalFiles = files.length

			for (const filePath of files) {
				const relativePath = path.relative(dirPath, filePath)
				const destPath = path.join(targetDir, relativePath)
				const destDir = path.dirname(destPath)
				const fileSize = await FileUtils.getFileSize(filePath)

				await FileUtils.ensureDir(destDir)
				await fs.copyFile(filePath, destPath)

				copiedFiles++

				this.emitProgress(progress, {
					status: "copying",
					file: path.basename(filePath),
					progress: Math.round((copiedFiles / totalFiles) * 100),
					totalFiles,
					copiedFiles,
					currentFile: {
						name: path.basename(filePath),
						size: fileSize,
						type: FileUtils.getContentType(filePath),
					},
				})
			}

			this.emitProgress(progress, {
				status: "completed",
				progress: 100,
				totalFiles,
				copiedFiles,
			})

			console.log(`Local storage completed: ${prefix}`)
			return this.getPublicUrl(prefix)
		} catch (error) {
			console.error("Local storage error:", error)
			throw error
		}
	}

	async uploadFile(filePath, destPath) {
		const destDir = path.dirname(destPath)
		await FileUtils.ensureDir(destDir)
		await fs.copyFile(filePath, destPath)
	}

	getPublicUrl(prefix) {
		return `/uploads/${prefix}`
	}
}

module.exports = LocalStorage
