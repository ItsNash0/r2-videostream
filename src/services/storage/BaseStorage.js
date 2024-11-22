class BaseStorage {
	async uploadDirectory(dirPath, prefix, videoId, progress) {
		throw new Error("Method not implemented")
	}

	async uploadFile(key, content, contentType) {
		throw new Error("Method not implemented")
	}

	getPublicUrl(prefix) {
		throw new Error("Method not implemented")
	}

	emitProgress(progress, data) {
		if (progress) {
			progress.onProgress("upload", data)
		}
	}
}

module.exports = BaseStorage
