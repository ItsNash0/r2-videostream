class ProgressEmitter {
	setIO(io) {
		this.io = io
	}

	createProgressHandler(videoId) {
		return {
			onStart: (stage) => {
				if (this.io) {
					this.io.emit(`progress:${videoId}`, {
						stage,
						status: "started",
						progress: 0,
					})
				}
			},

			onProgress: (stage, progress) => {
				if (this.io) {
					this.io.emit(`progress:${videoId}`, {
						stage,
						status: "processing",
						progress,
					})
				}
			},

			onComplete: (stage) => {
				if (this.io) {
					this.io.emit(`progress:${videoId}`, {
						stage,
						status: "completed",
						progress: 100,
					})
				}
			},

			onError: (stage, error) => {
				if (this.io) {
					this.io.emit(`progress:${videoId}`, {
						stage,
						status: "error",
						error: error.message,
					})
				}
			},
		}
	}
}

module.exports = new ProgressEmitter()
