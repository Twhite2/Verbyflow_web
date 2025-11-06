/**
 * Improved Audio utilities with Voice Activity Detection
 * Prevents sending silence to backend, reducing hallucinations
 */

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private audioContext: AudioContext | null = null
  private stream: MediaStream | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private intervalId: NodeJS.Timeout | null = null
  private audioChunks: Float32Array[] = []
  
  // VAD configuration
  private readonly SILENCE_THRESHOLD = 0.01  // RMS threshold for silence detection
  private readonly MIN_SPEECH_DURATION = 300  // Minimum speech duration in ms
  private readonly MAX_PAUSE_DURATION = 1500  // Maximum pause before sending chunk
  
  private lastSpeechTime: number = 0
  private isSpeaking: boolean = false
  
  /**
   * Calculate RMS (Root Mean Square) energy of audio
   */
  private calculateRMS(audioData: Float32Array): number {
    let sum = 0
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i]
    }
    return Math.sqrt(sum / audioData.length)
  }
  
  /**
   * Check if audio contains speech based on RMS energy
   */
  private containsSpeech(audioData: Float32Array): boolean {
    const rms = this.calculateRMS(audioData)
    return rms > this.SILENCE_THRESHOLD
  }
  
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
        const chunk = new Float32Array(inputData)
        
        // Voice Activity Detection
        const hasSpeech = this.containsSpeech(chunk)
        const now = Date.now()
        
        if (hasSpeech) {
          // Speech detected
          this.lastSpeechTime = now
          if (!this.isSpeaking) {
            this.isSpeaking = true
            console.log('🎤 Speech started')
          }
          this.audioChunks.push(chunk)
        } else if (this.isSpeaking) {
          // No speech, but we were speaking - check pause duration
          const pauseDuration = now - this.lastSpeechTime
          
          if (pauseDuration < this.MAX_PAUSE_DURATION) {
            // Short pause - keep collecting (natural sentence pause)
            this.audioChunks.push(chunk)
          } else {
            // Long pause - end of speech, send what we have
            console.log('🔇 Speech ended (pause detected)')
            this.sendAudioChunk(onDataAvailable)
            this.isSpeaking = false
          }
        }
        // Else: No speech and not speaking - do nothing (don't collect silence)
      }
      
      source.connect(this.scriptProcessor)
      this.scriptProcessor.connect(this.audioContext.destination)
      
      // Backup timer: Send chunks every 5 seconds if still speaking
      // This prevents extremely long chunks
      this.intervalId = setInterval(() => {
        if (this.isSpeaking && this.audioChunks.length > 0) {
          const duration = (this.audioChunks.length * 4096) / 16000
          if (duration > 5) {
            console.log('⏱️ Max duration reached, sending chunk')
            this.sendAudioChunk(onDataAvailable)
          }
        }
      }, 1000)
      
    } catch (error) {
      console.error('Failed to start recording:', error)
      throw error
    }
  }
  
  /**
   * Send accumulated audio chunks to backend
   */
  private sendAudioChunk(onDataAvailable: (audioData: string) => void): void {
    if (this.audioChunks.length === 0) return
    
    // Calculate duration
    const duration = (this.audioChunks.length * 4096) / 16000
    
    // Skip very short chunks (< 300ms)
    if (duration < this.MIN_SPEECH_DURATION / 1000) {
      console.log(`⏭️ Skipping short chunk (${duration.toFixed(2)}s)`)
      this.audioChunks = []
      return
    }
    
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
    
    console.log(`📤 Sending audio chunk: ${duration.toFixed(2)}s`)
    onDataAvailable(base64)
    
    // Clear chunks
    this.audioChunks = []
  }
  
  stopRecording(): void {
    // Send any remaining audio
    if (this.audioChunks.length > 0 && this.isSpeaking) {
      console.log('🛑 Stopping - sending final chunk')
      // Note: Can't call onDataAvailable here, so chunks are discarded
      // This is intentional - avoids sending incomplete thoughts
    }
    
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
    this.isSpeaking = false
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
