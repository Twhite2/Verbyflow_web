import { create } from 'zustand'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'searching' | 'paired'

interface Message {
  id: string
  text: string
  originalText?: string
  isOwn: boolean
  timestamp: Date
  hasAudio?: boolean
}

interface ConnectionState {
  // Connection state
  status: ConnectionStatus
  userId: string | null
  partnerId: string | null
  language: string
  
  // Messages
  messages: Message[]
  
  // Audio state
  isRecording: boolean
  isSpeaking: boolean
  voiceSampleCaptured: boolean
  isCapturingVoice: boolean
  storedVoiceSample: string | null  // Store voice sample for reuse
  
  // WebSocket
  ws: WebSocket | null
  
  // Actions
  initialize: () => void
  setLanguage: (lang: string) => void
  captureVoiceSample: () => Promise<void>
  findPartner: () => void
  disconnect: () => void
  sendAudioChunk: (audioData: string) => void
  sendVoiceSample: (audioData: string) => void
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  toggleRecording: () => void
  loadVoiceSample: () => void
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  // Initial state - Always start with null to avoid hydration errors
  status: 'disconnected',
  userId: null,
  partnerId: null,
  language: 'en',
  messages: [],
  isRecording: false,
  isSpeaking: false,
  voiceSampleCaptured: false,
  isCapturingVoice: false,
  storedVoiceSample: null,
  ws: null,
  
  // Initialize connection
  initialize: () => {
    const userId = `user_${Math.random().toString(36).substr(2, 9)}`
    const wsUrl = `ws://localhost:8000/ws/${userId}?lang=${get().language}`
    
    try {
      const ws = new WebSocket(wsUrl)
      
      ws.onopen = () => {
        console.log('WebSocket connected')
        set({ status: 'connected', userId, ws })
      }
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        console.log('📩 WebSocket message received:', data.type)
        
        switch (data.type) {
          case 'connected':
            set({ status: 'connected' })
            break
          
          case 'voice_sample_received':
            console.log('Voice sample stored on server')
            break
            
          case 'searching':
            set({ status: 'searching' })
            break
            
          case 'partner_found':
            set({ 
              status: 'paired', 
              partnerId: data.partner_id,
              messages: []
            })
            get().addMessage({
              text: 'Partner connected! Start speaking...',
              isOwn: false,
            })
            
            // Auto-resend stored voice sample for new partner
            const storedSample = get().storedVoiceSample
            if (storedSample) {
              console.log('Resending stored voice sample to new partner')
              get().sendVoiceSample(storedSample)
            }
            break
            
          case 'partner_disconnected':
            set({ status: 'connected', partnerId: null })
            get().addMessage({
              text: 'Partner disconnected.',
              isOwn: false,
            })
            break
            
          case 'direct_audio':
            // Direct voice chat mode - same language, no translation
            console.log('🎙️ Direct audio received (same language mode)')
            
            if (data.audio && data.audio.length > 0) {
              try {
                // Decode base64 audio
                const binaryString = atob(data.audio)
                const bytes = new Uint8Array(binaryString.length)
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i)
                }
                
                // Create audio context
                const audioContext = new AudioContext()
                const sampleRate = 16000 // Input audio is 16kHz
                
                // PCM is 16-bit (2 bytes per sample)
                const numSamples = bytes.length / 2
                const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate)
                const channelData = audioBuffer.getChannelData(0)
                
                // Convert 16-bit PCM to float32 (-1.0 to 1.0)
                const view = new DataView(bytes.buffer)
                for (let i = 0; i < numSamples; i++) {
                  const int16 = view.getInt16(i * 2, true)
                  channelData[i] = int16 / 32768.0
                }
                
                console.log('🔊 Playing direct audio! Duration:', audioBuffer.duration, 'seconds')
                
                // Play the audio
                const source = audioContext.createBufferSource()
                source.buffer = audioBuffer
                source.connect(audioContext.destination)
                source.start(0)
                
                source.onended = () => {
                  console.log('✅ Direct audio playback finished')
                }
              } catch (error) {
                console.error('❌ Failed to play direct audio:', error)
              }
            }
            break
            
          case 'audio_response':
            console.log('Received audio_response:', {
              hasAudio: !!data.audio,
              audioLength: data.audio?.length || 0,
              text: data.text
            })
            
            // Add translated message
            get().addMessage({
              text: data.text,
              originalText: data.original_text,
              isOwn: false,
              hasAudio: true
            })
            
            // Play audio if available
            if (data.audio && data.audio.length > 0) {
              console.log('Attempting to play audio...', data.audio.length, 'chars')
              try {
                // Decode base64 audio
                console.log('Decoding base64...')
                const binaryString = atob(data.audio)
                const bytes = new Uint8Array(binaryString.length)
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i)
                }
                console.log('Decoded to', bytes.length, 'bytes')
                
                // Create audio context
                const audioContext = new AudioContext()
                const sampleRate = 24000 // XTTS v2 output
                
                // Convert int16 PCM bytes to float32 audio buffer manually
                console.log('Converting PCM to AudioBuffer...')
                
                // PCM is 16-bit (2 bytes per sample)
                const numSamples = bytes.length / 2
                const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate)
                const channelData = audioBuffer.getChannelData(0)
                
                // Convert 16-bit PCM to float32 (-1.0 to 1.0)
                const view = new DataView(bytes.buffer)
                for (let i = 0; i < numSamples; i++) {
                  // Read 16-bit signed integer (little-endian)
                  const int16 = view.getInt16(i * 2, true)
                  // Convert to float32 range [-1, 1]
                  channelData[i] = int16 / 32768.0
                }
                
                console.log('AudioBuffer created! Duration:', audioBuffer.duration, 'seconds, Samples:', numSamples)
                
                // Play the audio
                const source = audioContext.createBufferSource()
                source.buffer = audioBuffer
                source.connect(audioContext.destination)
                source.start(0)
                console.log('🔊 Playing audio NOW!')
                
                source.onended = () => {
                  console.log('✅ Audio playback finished')
                }
              } catch (error) {
                console.error('❌ Failed to play audio (outer catch):', error)
              }
            } else {
              console.log('⚠️ No audio data received or empty audio')
            }
            break
            
          case 'error':
            console.error('Server error:', data.message)
            break
        }
      }
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        set({ status: 'disconnected' })
      }
      
      ws.onclose = () => {
        console.log('WebSocket closed')
        set({ status: 'disconnected', ws: null, partnerId: null })
      }
      
    } catch (error) {
      console.error('Failed to connect:', error)
      set({ status: 'disconnected' })
    }
  },
  
  // Set user language
  setLanguage: (lang: string) => {
    const { ws, status } = get()
    set({ language: lang })
    
    // If already connected, need to reconnect with new language
    if (ws && status !== 'disconnected') {
      ws.close()
      set({ 
        status: 'disconnected', 
        ws: null, 
        partnerId: null, 
        messages: [],
        voiceSampleCaptured: false  // Reset voice sample on language change
      })
    }
  },
  
  // Find a chat partner
  findPartner: () => {
    const { ws, status } = get()
    
    if (status === 'disconnected') {
      get().initialize()
      // Wait a bit then find partner
      setTimeout(() => get().findPartner(), 1000)
      return
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'find_partner' }))
      set({ status: 'searching' })
    }
  },
  
  // Disconnect from partner
  disconnect: () => {
    const { ws } = get()
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'disconnect' }))
    }
    
    // Keep voice sample and voiceSampleCaptured state for next connection
    set({ 
      status: 'connected', 
      partnerId: null,
      messages: []
    })
  },
  
  // Capture 10-second voice sample
  captureVoiceSample: async () => {
    set({ isCapturingVoice: true })
    
    return new Promise<void>((resolve) => {
      const { AudioRecorder } = require('./audioUtils')
      const recorder = new AudioRecorder()
      
      let voiceData: string[] = []
      
      recorder.startRecording((audioData: string) => {
        voiceData.push(audioData)
      })
      
      // Record for 10 seconds
      setTimeout(() => {
        recorder.stopRecording()
        
        // Properly combine base64 audio chunks
        // Step 1: Decode each base64 chunk to bytes
        const allBytes: number[] = []
        for (const base64Chunk of voiceData) {
          try {
            const binaryString = atob(base64Chunk)
            for (let i = 0; i < binaryString.length; i++) {
              allBytes.push(binaryString.charCodeAt(i))
            }
          } catch (e) {
            console.error('Failed to decode base64 chunk:', e)
          }
        }
        
        // Step 2: Convert bytes array to Uint8Array
        const combinedBytes = new Uint8Array(allBytes)
        
        // Step 3: Re-encode to base64 (process in chunks to avoid stack overflow)
        const chunkSize = 8192
        let binaryString = ''
        for (let i = 0; i < combinedBytes.length; i += chunkSize) {
          const chunk = combinedBytes.slice(i, i + chunkSize)
          binaryString += String.fromCharCode(...chunk)
        }
        const combinedVoice = btoa(binaryString)
        
        console.log(`Voice sample: ${voiceData.length} chunks, ${combinedBytes.length} bytes, ${combinedVoice.length} base64 chars`)
        
        // Send to server and store for reuse
        get().sendVoiceSample(combinedVoice)
        
        // Save to localStorage for persistence
        if (typeof window !== 'undefined') {
          localStorage.setItem('voiceSample', combinedVoice)
          console.log('Voice sample saved to localStorage')
        }
        
        set({ 
          isCapturingVoice: false,
          voiceSampleCaptured: true,
          storedVoiceSample: combinedVoice  // Store for reuse
        })
        
        resolve()
      }, 10000)
    })
  },
  
  // Send voice sample to server
  sendVoiceSample: (audioData: string) => {
    const { ws } = get()
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'voice_sample',
        audio: audioData
      }))
    }
  },
  
  // Send audio chunk to server
  sendAudioChunk: (audioData: string) => {
    const { ws, status } = get()
    
    if (status !== 'paired') return
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'audio_chunk',
        audio: audioData
      }))
    }
  },
  
  // Add message to chat
  addMessage: (message) => {
    const newMessage: Message = {
      ...message,
      id: `msg_${Date.now()}_${Math.random()}`,
      timestamp: new Date()
    }
    
    set((state) => ({
      messages: [...state.messages, newMessage]
    }))
  },
  
  // Toggle recording
  toggleRecording: () => {
    set({ isRecording: !get().isRecording })
  },
  
  // Load voice sample from localStorage (call from useEffect client-side only)
  loadVoiceSample: () => {
    if (typeof window !== 'undefined') {
      const voiceSample = localStorage.getItem('voiceSample')
      if (voiceSample) {
        set({ 
          storedVoiceSample: voiceSample,
          voiceSampleCaptured: true
        })
        console.log('Voice sample loaded from localStorage')
      }
    }
  }
}))
