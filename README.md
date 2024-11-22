# R2 Video Stream Processor

A Node.js application that processes video uploads, converts them to HLS format with multiple resolutions, and stores them in Cloudflare R2 (or locally during development) for streaming.

## Features

- Video upload through web interface
- Optimized video processing with FFmpeg
  - Hardware acceleration support (VideoToolbox, NVENC, VAAPI)
  - Smart bitrate allocation
  - Efficient encoding settings
- Multiple resolution variants (1080p, 720p, 480p, 360p)
- HLS streaming with 5-second segments
- Cloudflare R2 storage integration (optional for development)
- Video playback using HLS.js
- Real-time progress tracking
- Responsive web interface

## Video Processing Optimizations

### Hardware Acceleration
- macOS: VideoToolbox (h264_videotoolbox)
- Windows: NVIDIA NVENC (h264_nvenc)
- Linux: VAAPI (h264_vaapi)

### Encoding Optimizations
- Smart bitrate allocation based on resolution:
  - 1080p: 5000kbps
  - 720p: 3500kbps
  - 480p: 2500kbps
  - 360p: 1500kbps
- Optimized GOP (Group of Pictures) size based on framerate
- Fast encoding preset with high quality maintenance
- Buffer size optimization for consistent quality
- Scene change detection optimization
- Multi-threading support

## Prerequisites

- Node.js (v14 or higher)
- FFmpeg installed on your system
- Cloudflare R2 account with credentials (optional for development)

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

4. Configure your `.env` file:
```env
# Server Configuration
PORT=3000

# R2 Configuration (optional for development)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=your_r2_public_url

# Video Processing
MAX_FILE_SIZE=500000000 # 500MB
SEGMENT_DURATION=5
VIDEO_RESOLUTIONS=1080,720,480,360
VIDEO_CRF=23 # Constant Rate Factor (18-28, lower = better quality)
VIDEO_PRESET=veryfast # Encoding speed preset
```

## Video Processing Configuration

You can fine-tune video processing in `config/index.js`:

### Quality Settings
- `crf`: Constant Rate Factor (18-28)
  - Lower values = better quality, larger file size
  - Higher values = lower quality, smaller file size
  - Default: 23 (good balance)

### Encoding Presets
- `ultrafast`: Fastest encoding, largest file size
- `superfast`: Very fast encoding
- `veryfast`: Fast encoding (default)
- `faster`: Moderately fast encoding
- `fast`: Balanced speed/compression
- `medium`: Default FFmpeg preset
- `slow`: Better compression
- `slower`: Even better compression
- `veryslow`: Best compression, slowest encoding

### Resolution Bitrates
Customize bitrates for each resolution in `config/index.js`:
```javascript
bitrates: {
  '1080': '5000k',
  '720': '3500k',
  '480': '2500k',
  '360': '1500k'
}
```

## Usage

1. Start the development server:
```bash
npm run dev
```

2. Access the web interface at `http://localhost:3000`

3. Upload a video file through the interface

4. Monitor real-time progress:
   - Video Analysis
   - Transcoding (with hardware acceleration if available)
   - Playlist Generation
   - File Upload

5. Get results:
   - HLS playlist URL
   - Embed code
   - Live preview

## Development vs Production Mode

### Development Mode
- No R2 credentials required
- Files stored locally in `src/public/uploads`
- Perfect for testing and development

### Production Mode
- Requires R2 credentials in `.env`
- Files uploaded to Cloudflare R2
- Suitable for production deployment

## Project Structure

```
src/
├── config/         # Configuration management
├── controllers/    # Request handlers
├── services/       # Business logic
├── routes/         # API routes
├── public/         # Frontend assets
│   └── uploads/    # Local storage (development mode)
└── app.js         # Application entry point
```

## Error Handling

The application includes comprehensive error handling for:
- Invalid file types
- Upload size limits
- Processing failures
- Storage errors

## Development

Run the development server with hot reload:
```bash
npm run dev
```

## Production

1. Configure R2 credentials in `.env`
2. Start the production server:
```bash
npm start
```

## Performance Tips

1. Use hardware acceleration when available
2. Adjust CRF based on quality needs
3. Choose appropriate encoding preset
4. Monitor CPU and memory usage
5. Consider input video quality when selecting output resolutions
