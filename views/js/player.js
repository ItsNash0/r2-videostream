function initializePlayer(videoUrl) {
	if (Hls.isSupported()) {
		const video = document.createElement("video")
		video.controls = true
		video.style.width = "100%"
		video.style.maxHeight = "400px"
		video.style.backgroundColor = "#000"

		const hls = new Hls({
			debug: false,
			enableWorker: true,
			lowLatencyMode: true,
		})

		hls.loadSource(videoUrl)
		hls.attachMedia(video)
		hls.on(Hls.Events.MANIFEST_PARSED, () => {
			video.play()
		})

		return video
	} else if (video.canPlayType("application/vnd.apple.mpegurl")) {
		// Native HLS support (Safari)
		video.src = videoUrl
		return video
	}
	return null
}

function showVideoPlayer(videoUrl, containerId) {
	const container = document.getElementById(containerId)
	if (!container) return

	// Clear existing content
	container.innerHTML = ""

	const player = initializePlayer(videoUrl)
	if (player) {
		container.appendChild(player)
	} else {
		container.innerHTML =
			"<p>HLS playback is not supported in your browser.</p>"
	}
}

// Export functions
window.showVideoPlayer = showVideoPlayer
