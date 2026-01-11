/**
 * AudioWorklet-based real-time audio capture
 * Captures 20ms PCM frames (320 samples @ 16kHz)
 * Compliant with Master Spec: continuous flow, no batching
 */

export class AudioWorkletCapture {
  private audioContext: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private mediaStream: MediaStream | null = null
  private onFrameCallback: ((frameBytes: ArrayBuffer) => void) | null = null
  private isCapturing = false

  /**
   * Start capturing audio with AudioWorklet
   * @param onFrame Callback for each 20ms frame (320 samples Int16)
   */
  async startCapture(onFrame: (frameBytes: ArrayBuffer) => void): Promise<void> {
    if (this.isCapturing) {
      console.warn('Already capturing')
      return
    }

    this.onFrameCallback = onFrame

    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      // Create AudioContext
      this.audioContext = new AudioContext({ sampleRate: 16000 })
      
      // Register AudioWorklet processor
      const workletCode = this.getWorkletCode()
      const blob = new Blob([workletCode], { type: 'application/javascript' })
      const workletUrl = URL.createObjectURL(blob)
      
      await this.audioContext.audioWorklet.addModule(workletUrl)
      URL.revokeObjectURL(workletUrl)

      // Create worklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'frame-processor')
      
      // Handle messages from worklet
      this.workletNode.port.onmessage = (event) => {
        const frame: Float32Array = event.data
        
        // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
        const int16Frame = new Int16Array(frame.length)
        for (let i = 0; i < frame.length; i++) {
          const sample = Math.max(-1, Math.min(1, frame[i]))
          int16Frame[i] = sample < 0 ? sample * 32768 : sample * 32767
        }
        
        // Send to callback
        if (this.onFrameCallback) {
          this.onFrameCallback(int16Frame.buffer)
        }
      }

      // Connect audio graph
      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      source.connect(this.workletNode)
      // Note: We don't connect to destination (no audio playback)

      this.isCapturing = true
      console.log('✅ AudioWorklet capture started (16kHz, 20ms frames)')
    } catch (error) {
      console.error('Failed to start AudioWorklet capture:', error)
      throw error
    }
  }

  /**
   * Stop capturing audio
   */
  stopCapture(): void {
    if (!this.isCapturing) return

    // Stop media stream tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    // Disconnect worklet
    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode = null
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.isCapturing = false
    this.onFrameCallback = null
    console.log('🛑 AudioWorklet capture stopped')
  }

  /**
   * Get AudioWorklet processor code as string
   */
  private getWorkletCode(): string {
    return `
      class FrameProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.buffer = new Float32Array(320);  // 20ms @ 16kHz
          this.offset = 0;
        }

        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (!input || !input[0]) {
            return true;
          }

          const inputChannel = input[0];  // Mono channel
          
          // Accumulate samples to 320 (20ms)
          for (let i = 0; i < inputChannel.length; i++) {
            this.buffer[this.offset++] = inputChannel[i];
            
            if (this.offset === 320) {
              // Send full frame to main thread
              this.port.postMessage(this.buffer.slice());
              this.offset = 0;
            }
          }

          return true;  // Keep processor alive
        }
      }

      registerProcessor('frame-processor', FrameProcessor);
    `
  }

  /**
   * Check if currently capturing
   */
  get capturing(): boolean {
    return this.isCapturing
  }
}
