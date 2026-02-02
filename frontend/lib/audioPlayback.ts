/**
 * Audio playback handler for received TTS chunks
 * Progressive playback with interrupt support
 */

export class AudioPlayback {
  private audioContext: AudioContext | null = null
  private playQueue: Blob[] = []
  private isPlaying = false
  private currentSource: AudioBufferSourceNode | null = null

  constructor() {
    // AudioContext will be created on first play (user interaction required)
  }

  /**
   * Add audio chunk to play queue
   * @param audioData Base64 encoded audio or raw bytes
   */
  async enqueueChunk(audioData: string | ArrayBuffer): Promise<void> {
    try {
      console.log('📥 Enqueuing chunk:', typeof audioData, typeof audioData === 'string' ? audioData.length : 'N/A')
      
      // Convert to Blob
      let blob: Blob
      if (typeof audioData === 'string') {
        // Base64 string
        const binaryString = atob(audioData)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        console.log('📦 Decoded to', bytes.length, 'bytes')
        blob = new Blob([bytes], { type: 'audio/pcm' })
      } else {
        // ArrayBuffer
        blob = new Blob([audioData], { type: 'audio/pcm' })
      }

      this.playQueue.push(blob)
      console.log('📊 Queue size:', this.playQueue.length, 'isPlaying:', this.isPlaying)

      // Start playback if not already playing
      if (!this.isPlaying) {
        console.log('▶️ Starting playback')
        await this.playNext()
      }
    } catch (error) {
      console.error('❌ Failed to enqueue audio chunk:', error)
    }
  }

  /**
   * Play next chunk from queue
   */
  private async playNext(): Promise<void> {
    if (this.playQueue.length === 0) {
      this.isPlaying = false
      console.log('🏁 Playback queue empty')
      return
    }

    this.isPlaying = true

    try {
      // Initialize AudioContext if needed
      if (!this.audioContext) {
        this.audioContext = new AudioContext()
        console.log('🎵 AudioContext created')
      }
      
      // Resume AudioContext if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
        console.log('▶️ AudioContext resumed from suspended state')
      }

      // Get next chunk
      const blob = this.playQueue.shift()!
      const arrayBuffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)

      // XTTS outputs 24kHz 16-bit PCM
      const sampleRate = 24000
      const numSamples = bytes.length / 2  // 16-bit = 2 bytes per sample

      // Create audio buffer manually from raw PCM
      const audioBuffer = this.audioContext.createBuffer(1, numSamples, sampleRate)
      const channelData = audioBuffer.getChannelData(0)

      // Convert 16-bit PCM to float32 [-1.0, 1.0]
      const view = new DataView(bytes.buffer)
      for (let i = 0; i < numSamples; i++) {
        const int16 = view.getInt16(i * 2, true)  // Little-endian
        channelData[i] = int16 / 32768.0
      }

      console.log(`🔊 Playing chunk: ${audioBuffer.duration.toFixed(2)}s, ${numSamples} samples`)

      // Create source
      this.currentSource = this.audioContext.createBufferSource()
      this.currentSource.buffer = audioBuffer
      this.currentSource.connect(this.audioContext.destination)

      // Handle end of playback
      this.currentSource.onended = () => {
        this.currentSource = null
        this.playNext()  // Play next chunk
      }

      // Start playback
      this.currentSource.start()
    } catch (error) {
      console.error('❌ Playback error:', error)
      this.isPlaying = false
      // Try next chunk
      if (this.playQueue.length > 0) {
        await this.playNext()
      }
    }
  }

  /**
   * Stop current playback and clear queue
   */
  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop()
        this.currentSource.disconnect()
      } catch (e) {
        // Already stopped
      }
      this.currentSource = null
    }

    this.playQueue = []
    this.isPlaying = false
    console.log('🛑 Playback stopped')
  }

  /**
   * Check if currently playing
   */
  get playing(): boolean {
    return this.isPlaying
  }
}
