const fs = require("fs").promises
const path = require("path")

class FileUtils {
	static async getAllFiles(dirPath) {
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

	static getContentType(filePath) {
		const ext = path.extname(filePath).toLowerCase()
		const contentTypes = {
			".m3u8": "application/x-mpegURL",
			".ts": "video/MP2T",
			".mp4": "video/mp4",
		}

		return contentTypes[ext] || "application/octet-stream"
	}

	static async ensureDir(dir) {
		await fs.mkdir(dir, { recursive: true })
	}

	static async getFileSize(filePath) {
		const stats = await fs.stat(filePath)
		return stats.size
	}
}

module.exports = FileUtils
