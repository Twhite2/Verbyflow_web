/**
 * Audio utilities for recording and processing
 */

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private audioContext: AudioContext | null = null
  private stream: MediaStream | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private intervalId: NodeJS.Timeout | null = null
  private audioChunks: Float32Array[] = []
  
  async startRecording(onDataAvailable: (audioData: string) => void): Promise<void> {
    try {
      // Get microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000  // Whisper expects 16kHz
        } 
      })
      
      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: 16000 })
      const source = this.audioContext.createMediaStreamSource(this.stream)
      
      // Create script processor for raw audio
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1)
      
      this.scriptProcessor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0)
        this.audioChunks.push(new Float32Array(inputData))
      }
      
      source.connect(this.scriptProcessor)
      this.scriptProcessor.connect(this.audioContext.destination)
      
      // Send audio chunks every 2 seconds
      this.intervalId = setInterval(() => {
        if (this.audioChunks.length > 0) {
          // Concatenate all chunks
          const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)
          const combined = new Float32Array(totalLength)
          let offset = 0
          for (const chunk of this.audioChunks) {
            combined.set(chunk, offset)
            offset += chunk.length
          }
          
          // Convert float32 to int16 PCM
          const int16 = new Int16Array(combined.length)
          for (let i = 0; i < combined.length; i++) {
            const s = Math.max(-1, Math.min(1, combined[i]))
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
          }
          
          // Convert to base64 (process in chunks to avoid stack overflow)
          const bytes = new Uint8Array(int16.buffer)
          const chunkSize = 8192
          let binaryString = ''
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.slice(i, i + chunkSize)
            binaryString += String.fromCharCode(...chunk)
          }
          const base64 = btoa(binaryString)
          onDataAvailable(base64)
          
          // Clear chunks
          this.audioChunks = []
        }
      }, 2000)
      
    } catch (error) {
      console.error('Failed to start recording:', error)
      throw error
    }
  }
  
  stopRecording(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect()
      this.scriptProcessor = null
    }
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
    }
    
    if (this.audioContext) {
      this.audioContext.close()
    }
    
    this.audioChunks = []
  }
  
  isRecording(): boolean {
    return this.audioContext?.state === 'running'
  }
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null
  
  async playAudio(base64Audio: string): Promise<void> {
    try {
      // Create audio context if needed
      if (!this.audioContext) {
        this.audioContext = new AudioContext()
      }
      
      // Decode base64 to array buffer
      const binaryString = atob(base64Audio)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      // Decode audio data
      const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer)
      
      // Create and play source
      const source = this.audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.audioContext.destination)
      source.start()
      
    } catch (error) {
      console.error('Failed to play audio:', error)
    }
  }
}
