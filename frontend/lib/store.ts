import { create } from 'zustand'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'searching' | 'paired'

interface Message {
  id: string
  text: string
  originalText?: string
  isOwn: boolean
  timestamp: Date
  hasAudio?: boolean
  voiceNote?: string  // Base64 encoded audio data
  audioData?: string  // Base64 encoded audio for playback
  type?: 'text' | 'voice_note'  // Message type
}

interface ConnectionState {
  // Connection state
  status: ConnectionStatus
  userId: string | null
  partnerId: string | null
  language: string
  gender: string  // 'male' or 'female' - for TTS voice selection
  
  // Messages
  messages: Message[]
  
  // Audio state
  isRecording: boolean
  isSpeaking: boolean
  ttsPlaying: boolean  // True when TTS audio is playing (echo suppression)
  
  // WebSocket
  ws: WebSocket | null
  
  // WebRTC callbacks (set by VideoCallInterface)
  onWebRTCOffer?: (offer: RTCSessionDescriptionInit, fromUser: string) => void
  onWebRTCAnswer?: (answer: RTCSessionDescriptionInit, fromUser: string) => void
  onWebRTCIceCandidate?: (candidate: RTCIceCandidateInit, fromUser: string) => void
  
  // Text chat state
  isPartnerTyping: boolean
  
  // Actions
  initialize: () => void
  setLanguage: (lang: string) => void
  setGender: (gender: string) => void
  findPartner: () => void
  disconnect: () => void
  sendAudioChunk: (audioData: string) => void
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  toggleRecording: () => void
  sendWebRTCOffer: (offer: RTCSessionDescriptionInit) => void
  sendWebRTCAnswer: (answer: RTCSessionDescriptionInit) => void
  sendWebRTCIceCandidate: (candidate: RTCIceCandidateInit) => void
  setWebRTCCallbacks: (callbacks: {
    onWebRTCOffer?: (offer: RTCSessionDescriptionInit, fromUser: string) => void
    onWebRTCAnswer?: (answer: RTCSessionDescriptionInit, fromUser: string) => void
    onWebRTCIceCandidate?: (candidate: RTCIceCandidateInit, fromUser: string) => void
  }) => void
  sendTextMessage: (text: string) => void
  sendVoiceNote: (audioData: string) => void
  sendTypingIndicator: (isTyping: boolean) => void
  clearMessages: () => void
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  // Initial state - Always start with null to avoid hydration errors
  status: 'disconnected',
  userId: null,
  partnerId: null,
  language: 'en',
  gender: 'female',
  messages: [],
  isRecording: false,
  ttsPlaying: false,
  isSpeaking: false,
  ws: null,
  isPartnerTyping: false,
  
  // Initialize connection
  initialize: () => {
    // Prevent duplicate connections - check BOTH open AND connecting states
    const currentWs = get().ws
    if (currentWs && (currentWs.readyState === WebSocket.OPEN || currentWs.readyState === WebSocket.CONNECTING)) {
      console.log('WebSocket already connected/connecting, skipping initialization')
      return
    }
    
    // Close any stale connection before creating a new one
    if (currentWs) {
      console.log('Closing stale WebSocket before reconnecting')
      currentWs.onclose = null  // Prevent onclose from firing
      currentWs.onerror = null
      currentWs.onmessage = null
      currentWs.close()
    }
    
    const userId = `user_${Math.random().toString(36).substr(2, 9)}`
    const wsUrl = `ws://localhost:8000/ws/${userId}?lang=${get().language}&gender=${get().gender}`
    
    try {
      const ws = new WebSocket(wsUrl)
      // CRITICAL: Store WS and userId immediately to prevent duplicate connections
      set({ status: 'connecting', ws, userId })
      
      ws.onopen = () => {
        console.log(`WebSocket connected as ${userId}`)
        set({ status: 'connected' })
      }
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        console.log('📩 WebSocket message received:', data.type, data)
        
        switch (data.type) {
          case 'connected':
            set({ status: 'connected' })
            break
          
          case 'gender_updated':
            console.log('Gender preference updated on server:', data.gender)
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
            break
            
          case 'partner_disconnected':
            // Stop all audio on disconnect (like a phone call)
            const audioPlayback = (window as any).audioPlayback
            if (audioPlayback) {
              console.log('📞 Partner disconnected - stopping audio playback')
              audioPlayback.stop()
            }
            
            const audioWorklet = (window as any).audioWorklet
            if (audioWorklet) {
              console.log('📞 Partner disconnected - stopping audio capture')
              audioWorklet.stopCapture()
            }
            
            set({ status: 'connected', partnerId: null, isRecording: false })
            get().addMessage({
              text: 'Partner disconnected.',
              isOwn: false,
            })
            break
            
          case 'message':
            // Translated text message from partner
            console.log('💬 Message received:', data.text)
            get().addMessage({
              text: data.text,
              originalText: data.original_text,
              isOwn: false,
            })
            break
            
          case 'partial_transcript':
            // Real-time partial transcript (UI only, not translated)
            console.log('💬 Partial transcript:', data.text)
            // Store in state or display - handled by component
            break
          
          case 'tts_playing':
            // Echo suppression: TTS is about to play, pause mic capture
            console.log('🔇 TTS playing - echo suppression ON')
            set({ ttsPlaying: true })
            break
          
          case 'tts_done':
            // Echo suppression: TTS finished, resume mic capture
            console.log('🔊 TTS done - echo suppression OFF')
            set({ ttsPlaying: false })
            break
          
          case 'audio_chunk':
            // TTS audio chunk from backend (translated speech)
            console.log('🔊 Audio chunk received:', {
              hasAudio: !!data.audio,
              audioLength: data.audio?.length,
              playbackExists: !!(window as any).audioPlayback
            })
            if (data.audio) {
              // Forward to AudioPlayback component
              const audioPlayback = (window as any).audioPlayback
              if (audioPlayback) {
                console.log('✅ Enqueuing chunk to AudioPlayback')
                audioPlayback.enqueueChunk(data.audio)
              } else {
                console.error('❌ AudioPlayback not found on window object!')
              }
            } else {
              console.warn('⚠️ No audio data in chunk')
            }
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
            
          case 'webrtc_offer':
            console.log('📹 WebRTC offer received from partner')
            if (get().onWebRTCOffer) {
              get().onWebRTCOffer!(data.offer, data.from_user)
            }
            break
            
          case 'webrtc_answer':
            console.log('📹 WebRTC answer received from partner')
            if (get().onWebRTCAnswer) {
              get().onWebRTCAnswer!(data.answer, data.from_user)
            }
            break
            
          case 'webrtc_ice_candidate':
            console.log('🧊 ICE candidate received from partner')
            if (get().onWebRTCIceCandidate) {
              get().onWebRTCIceCandidate!(data.candidate, data.from_user)
            }
            break
            
          case 'audio_chunk_stream':
            console.log('🎵 Audio chunk received:', data.chunk_number)
            
            // Add message on first chunk
            if (data.chunk_number === 1 && data.text) {
              get().addMessage({
                text: data.text,
                originalText: data.original_text,
                isOwn: false,
                hasAudio: true
              })
            }
            
            // Play audio chunk immediately
            if (data.audio && data.audio.length > 0) {
              try {
                const binaryString = atob(data.audio)
                const bytes = new Uint8Array(binaryString.length)
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i)
                }
                
                // Create audio context (reuse if exists)
                const audioContext = new AudioContext()
                const sampleRate = 24000
                
                // Convert PCM to AudioBuffer
                const numSamples = bytes.length / 2
                const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate)
                const channelData = audioBuffer.getChannelData(0)
                
                const view = new DataView(bytes.buffer)
                for (let i = 0; i < numSamples; i++) {
                  const int16 = view.getInt16(i * 2, true)
                  channelData[i] = int16 / 32768.0
                }
                
                // Play immediately
                const source = audioContext.createBufferSource()
                source.buffer = audioBuffer
                source.connect(audioContext.destination)
                source.start(0)
                
                console.log(`🔊 Playing chunk ${data.chunk_number} (${audioBuffer.duration.toFixed(2)}s)`)
              } catch (error) {
                console.error('❌ Failed to play audio chunk:', error)
              }
            }
            break
            
          case 'audio_stream_complete':
            console.log('✅ Audio stream complete:', data.total_chunks, 'chunks')
            break
            
          case 'translation_result':
            console.log('🌐 Translation result received:', data.translation)
            
            // Add translated message to chat
            get().addMessage({
              text: data.translation,
              originalText: data.transcription,
              isOwn: false,
              hasAudio: true
            })
            
            // Play TTS audio
            if (data.audio && data.audio.length > 0) {
              try {
                const binaryString = atob(data.audio)
                const bytes = new Uint8Array(binaryString.length)
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i)
                }
                
                const audioContext = new AudioContext()
                const sampleRate = 24000 // XTTS output
                
                // Convert PCM to AudioBuffer
                const numSamples = bytes.length / 2
                const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate)
                const channelData = audioBuffer.getChannelData(0)
                
                const view = new DataView(bytes.buffer)
                for (let i = 0; i < numSamples; i++) {
                  const int16 = view.getInt16(i * 2, true)
                  channelData[i] = int16 / 32768.0
                }
                
                // Play audio
                const source = audioContext.createBufferSource()
                source.buffer = audioBuffer
                source.connect(audioContext.destination)
                source.start(0)
                
                console.log(`🔊 Playing TTS translation (${audioBuffer.duration.toFixed(2)}s)`)
              } catch (error) {
                console.error('❌ Failed to play TTS audio:', error)
              }
            }
            break
            
          case 'text_message_received':
            console.log('💬 Text message received:', data.text)
            get().addMessage({
              text: data.text,
              originalText: data.original_text,
              isOwn: false,
            })
            break
            
          case 'voice_note_received':
            console.log('🎤 Voice note received from partner with transcription')
            console.log('📦 Voice note data:', {
              hasText: !!data.text,
              hasAudio: !!data.audio,
              textLength: data.text?.length,
              audioLength: data.audio?.length,
              originalText: data.original_text
            })
            
            // Voice notes now send original audio + translated text
            // Store the audio blob and transcription text
            if (data.text && data.audio) {
              console.log('💬 Voice note translated text:', data.text)
              console.log('🔊 Voice note audio (first 50 chars):', data.audio.substring(0, 50))
              get().addMessage({
                text: data.text,  // Translated text for reading
                originalText: data.original_text,  // Original transcription
                audioData: data.audio,  // Original audio blob (base64)
                isOwn: false,
                type: 'voice_note'
              })
              console.log('✅ Voice note message added to store')
            } else {
              console.error('❌ Voice note missing text or audio!', { hasText: !!data.text, hasAudio: !!data.audio })
            }
            break
            
          case 'text_message_sent':
            console.log('✅ Text message sent confirmation')
            // Message already added locally when sent
            break
            
          case 'partner_typing':
            set({ isPartnerTyping: data.is_typing })
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
        messages: []
      })
      
      // Auto-reconnect with new language after a short delay
      setTimeout(() => {
        get().initialize()
      }, 500)
    }
  },
  
  // Find a chat partner
  findPartner: () => {
    const { ws, status } = get()
    
    console.log('🔍 findPartner called - status:', status, 'ws readyState:', ws?.readyState)
    
    if (status === 'disconnected' || status === 'connecting') {
      console.log('Not connected yet, initializing...')
      get().initialize()
      // Wait a bit then find partner
      setTimeout(() => get().findPartner(), 1500)
      return
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('✅ Sending find_partner message to backend')
      ws.send(JSON.stringify({ type: 'find_partner' }))
      set({ status: 'searching' })
    } else {
      console.error('❌ Cannot send find_partner - WebSocket not ready:', {
        hasWs: !!ws,
        readyState: ws?.readyState,
        status
      })
    }
  },
  
  // Disconnect from partner
  disconnect: () => {
    const { ws } = get()
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'disconnect' }))
    }
    
    set({ 
      status: 'connected', 
      partnerId: null,
      messages: []
    })
  },
  
  // Set preferred TTS voice gender
  setGender: (gender: string) => {
    const validGender = gender === 'male' ? 'male' : 'female'
    set({ gender: validGender })
    
    // Notify server if connected
    const { ws } = get()
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'set_gender',
        gender: validGender
      }))
    }
    
    // Persist preference
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferredGender', validGender)
    }
  },
  
  // Send audio chunk to server
  sendAudioChunk: (audioData: string) => {
    const { ws, status, ttsPlaying } = get()
    
    if (status !== 'paired') return
    
    // Echo suppression: don't send audio while TTS is playing
    // (mic would pick up TTS speaker output and create feedback loop)
    if (ttsPlaying) return
    
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
  
  // WebRTC methods
  sendWebRTCOffer: (offer) => {
    const { ws } = get()
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('📹 Sending WebRTC offer')
      ws.send(JSON.stringify({
        type: 'webrtc_offer',
        offer
      }))
    }
  },
  
  sendWebRTCAnswer: (answer) => {
    const { ws } = get()
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('📹 Sending WebRTC answer')
      ws.send(JSON.stringify({
        type: 'webrtc_answer',
        answer
      }))
    }
  },
  
  sendWebRTCIceCandidate: (candidate) => {
    const { ws } = get()
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('🧊 Sending ICE candidate')
      ws.send(JSON.stringify({
        type: 'webrtc_ice_candidate',
        candidate
      }))
    }
  },
  
  setWebRTCCallbacks: (callbacks) => {
    set({
      onWebRTCOffer: callbacks.onWebRTCOffer,
      onWebRTCAnswer: callbacks.onWebRTCAnswer,
      onWebRTCIceCandidate: callbacks.onWebRTCIceCandidate
    })
  },
  
  // Text chat methods
  sendTextMessage: (text) => {
    const { ws, status } = get()
    
    if (status !== 'paired') {
      console.warn('Cannot send text message - not paired')
      return
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      const messageId = `msg_${Date.now()}_${Math.random()}`
      const timestamp = new Date().toISOString()
      
      console.log('💬 Sending text message:', text)
      ws.send(JSON.stringify({
        type: 'text_message',
        text,
        message_id: messageId,
        timestamp
      }))
      
      // Add message to local store immediately
      get().addMessage({
        text,
        isOwn: true
      })
    } else {
      console.error('Cannot send text message - WebSocket not ready')
    }
  },
  
  sendVoiceNote: (audioData) => {
    const { ws, status } = get()
    
    if (status !== 'paired') {
      console.warn('Cannot send voice note - not paired')
      return
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      const messageId = `voice_${Date.now()}_${Math.random()}`
      const timestamp = new Date().toISOString()
      
      console.log('🎤 Sending voice note')
      ws.send(JSON.stringify({
        type: 'voice_note',
        audio: audioData,
        message_id: messageId,
        timestamp
      }))
      
      // Add voice note message to local store immediately
      get().addMessage({
        text: 'Voice note',
        isOwn: true,
        voiceNote: audioData,
        type: 'voice_note'
      })
    } else {
      console.error('Cannot send voice note - WebSocket not ready')
    }
  },
  
  clearMessages: () => {
    set({ messages: [] })
    console.log('🗑️ Messages cleared')
  },
  
  sendTypingIndicator: (isTyping) => {
    const { ws, status } = get()
    
    if (status !== 'paired') return
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'typing_indicator',
        is_typing: isTyping
      }))
    }
  }
}))
