const socket = io()
const chunkSize = 1024 * 1024 // 1MB chunks

// Elements
const uploadForm = document.getElementById("uploadForm")
const progressContainer = document.getElementById("progressContainer")
const uploadProgress = document.getElementById("uploadProgress")
const uploadStatus = document.getElementById("uploadStatus")

// Socket authentication
function authenticateSocket(userId) {
	socket.on("connect", () => {
		socket.emit("authenticate", userId)
	})
}

// Upload handlers
async function uploadChunk(file, start, videoId) {
	const chunk = file.slice(start, start + chunkSize)
	const formData = new FormData()
	formData.append("chunk", chunk)
	formData.append("start", start)
	formData.append("videoId", videoId)
	formData.append("total", file.size)

	const response = await fetch("/upload-chunk", {
		method: "POST",
		body: formData,
	})

	if (!response.ok) {
		throw new Error("Upload failed")
	}

	return response.json()
}

async function uploadFile(file, title) {
	const videoId = Date.now().toString()
	let start = 0

	progressContainer.classList.remove("hidden")

	// Initialize upload
	const initResponse = await fetch("/init-upload", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			filename: file.name,
			title: title,
			size: file.size,
			videoId: videoId,
		}),
	})

	if (!initResponse.ok) {
		throw new Error("Failed to initialize upload")
	}

	while (start < file.size) {
		await uploadChunk(file, start, videoId)
		start += chunkSize

		const progress = Math.min((start / file.size) * 100, 100)
		updateProgress(progress)
	}

	return videoId
}

// Progress updates
function updateProgress(percent) {
	uploadProgress.style.width = percent + "%"
	uploadStatus.textContent = Math.round(percent) + "%"
}

function updateVideoProgress(videoId, percent, resolution) {
	const videoContainer = document.getElementById("video-" + videoId)
	if (videoContainer) {
		const progressBar = videoContainer.querySelector(".progress")
		const progressText = videoContainer.querySelector(".progress-text")
		const status = videoContainer.querySelector(".status")

		if (progressBar && progressText) {
			progressBar.style.width = percent + "%"
			progressText.textContent = percent + "%"
			status.textContent = "Status: Processing " + resolution
		}
	}
}

function updateUploadStatus(videoId, key) {
	const videoContainer = document.getElementById("video-" + videoId)
	if (videoContainer) {
		const status = videoContainer.querySelector(".status")
		if (status) {
			status.textContent = "Status: Uploading " + key
		}
	}
}

// Event listeners
if (uploadForm) {
	uploadForm.onsubmit = async (e) => {
		e.preventDefault()

		const file = uploadForm.video.files[0]
		const title = uploadForm.title.value

		try {
			await uploadFile(file, title)
			window.location.reload()
		} catch (error) {
			alert("Error: " + error.message)
		}
	}
}

// Socket event handlers
socket.on("processingProgress", (data) => {
	updateVideoProgress(data.videoId, data.percent, data.resolution)
})

socket.on("uploadProgress", (data) => {
	updateUploadStatus(data.videoId, data.key)
})

// Export functions
window.authenticateSocket = authenticateSocket
