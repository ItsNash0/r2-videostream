const path = require("path")
const R2Storage = require("./storage/R2Storage")
const LocalStorage = require("./storage/LocalStorage")

class StorageService {
	constructor(config) {
		if (config.r2.isConfigured) {
			try {
				this.storage = new R2Storage(config.r2)
				console.log("Using R2 storage")
			} catch (error) {
				console.warn(
					"Failed to initialize R2, falling back to local storage:",
					error
				)
				this.storage = new LocalStorage(__dirname)
			}
		} else {
			console.log("R2 not configured, using local storage")
			this.storage = new LocalStorage(__dirname)
		}
	}

	async uploadDirectory(dirPath, prefix, videoId, progress) {
		try {
			return await this.storage.uploadDirectory(
				dirPath,
				prefix,
				videoId,
				progress
			)
		} catch (error) {
			// If R2 storage fails, fallback to local storage
			if (this.storage instanceof R2Storage) {
				console.log("R2 storage failed, falling back to local storage")
				this.storage = new LocalStorage(__dirname)
				return await this.storage.uploadDirectory(
					dirPath,
					prefix,
					videoId,
					progress
				)
			}
			throw error
		}
	}

	async uploadFile(key, content, contentType) {
		return await this.storage.uploadFile(key, content, contentType)
	}

	getPublicUrl(prefix) {
		return this.storage.getPublicUrl(prefix)
	}
}

module.exports = new StorageService(require("../config"))
