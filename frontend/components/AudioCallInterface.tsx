'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  Mic, MicOff, PhoneOff, Volume2, VolumeX,
  User, MessageSquare
} from 'lucide-react'
import { useConnectionStore } from '@/lib/store'
import { AudioWorkletCapture } from '@/lib/audioWorklet'
import { AudioPlayback } from '@/lib/audioPlayback'

interface AudioCallInterfaceProps {
  language: string
  onDisconnect: () => void
}

export default function AudioCallInterface({ language, onDisconnect }: AudioCallInterfaceProps) {
  const [isMicOn, setIsMicOn] = useState(true)
  const [isVolumeOn, setIsVolumeOn] = useState(true)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [message, setMessage] = useState('')
  
  const audioWorkletRef = useRef<AudioWorkletCapture | null>(null)
  const audioPlaybackRef = useRef<AudioPlayback | null>(null)
  const hasCalledFindPartnerRef = useRef(false)
  
  // Zustand store
  const status = useConnectionStore(state => state.status)
  const partnerId = useConnectionStore(state => state.partnerId)
  const messages = useConnectionStore(state => state.messages)
  const findPartner = useConnectionStore(state => state.findPartner)
  const disconnect = useConnectionStore(state => state.disconnect)
  const sendAudioChunk = useConnectionStore(state => state.sendAudioChunk)
  
  // NOTE: WebSocket initialization is handled by page.tsx when mode is selected
  // Do NOT call initialize() here - it causes duplicate connections
  
  // Auto-find partner when connected (no voice sample needed anymore)
  useEffect(() => {
    if (status === 'connected' && !hasCalledFindPartnerRef.current) {
      console.log('🎤 Auto-finding partner')
      hasCalledFindPartnerRef.current = true
      setTimeout(() => findPartner(), 500)
    } else if (status === 'disconnected') {
      hasCalledFindPartnerRef.current = false
    }
  }, [status, findPartner])
  
  // Start/stop audio recording based on mic state and partner status
  useEffect(() => {
    if (status === 'paired' && isMicOn) {
      startAudioRecording()
    } else {
      stopAudioRecording()
    }
    
    return () => {
      stopAudioRecording()
    }
  }, [status, isMicOn])
  
  const startAudioRecording = () => {
    if (audioWorkletRef.current?.capturing) return
    
    const worklet = new AudioWorkletCapture()
    audioWorkletRef.current = worklet
    
    worklet.startCapture((frameBytes: ArrayBuffer) => {
      if (status === 'paired') {
        // Convert ArrayBuffer to base64
        const bytes = new Uint8Array(frameBytes)
        const binaryString = Array.from(bytes)
          .map(byte => String.fromCharCode(byte))
          .join('')
        const base64 = btoa(binaryString)
        
        sendAudioChunk(base64)
      }
    }).catch(error => {
      console.error('Failed to start AudioWorklet capture:', error)
      setIsMicOn(false)
    })
  }
  
  const stopAudioRecording = () => {
    if (audioWorkletRef.current) {
      audioWorkletRef.current.stopCapture()
      audioWorkletRef.current = null
    }
  }
  
  // Initialize audio playback and expose globally for WebSocket messages
  useEffect(() => {
    // Create AudioPlayback ONCE and keep it on window permanently
    if (!(window as any).audioPlayback) {
      console.log('🔊 Creating AudioPlayback instance')
      const playback = new AudioPlayback()
      audioPlaybackRef.current = playback
      ;(window as any).audioPlayback = playback
    } else {
      // Reuse existing instance
      console.log('🔊 Reusing existing AudioPlayback instance')
      audioPlaybackRef.current = (window as any).audioPlayback
    }
    
    return () => {
      // DON'T delete window.audioPlayback - keep it for audio chunks
      // Just stop current playback
      if (audioPlaybackRef.current) {
        console.log('🛑 Stopping playback (keeping instance)')
        audioPlaybackRef.current.stop()
      }
    }
  }, [])
  
  const toggleMic = () => {
    setIsMicOn(!isMicOn)
  }
  
  const toggleVolume = () => setIsVolumeOn(!isVolumeOn)
  
  const handleDisconnect = () => {
    stopAudioRecording()
    disconnect()
    onDisconnect()
  }

  const sendMessage = () => {
    if (message.trim()) {
      setMessage('')
    }
  }

  return (
    <div className="h-screen bg-gradient-to-br from-[#1B3A57] via-[#0F2E4D] to-[#FF6B35] flex items-center justify-center p-8">
      <div className="max-w-4xl w-full">
        {/* Status Header */}
        <div className="text-center mb-8">
          <div className="inline-block bg-white rounded-2xl px-6 py-4 mb-6 shadow-2xl">
            <img src="/verbyflow-logo.png" alt="VerbyFlow" className="h-16 w-auto" />
          </div>
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className={`w-3 h-3 rounded-full animate-pulse ${
              status === 'paired' ? 'bg-green-400' : 'bg-yellow-400'
            }`}></div>
            <span className="text-white text-lg font-medium">
              {status === 'paired' ? 'Audio Call Active' : 'Searching for Partner...'}
            </span>
          </div>
          <p className="text-orange-200">Translation: {language} ↔ Partner's Language</p>
        </div>

        {/* Main Audio Visualization Area */}
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-12 mb-8">
          <div className="grid grid-cols-2 gap-8">
            {/* Your Avatar */}
            <div className="text-center">
              <div className="relative mx-auto w-48 h-48 mb-6">
                <div className={`absolute inset-0 rounded-full ${isMicOn ? 'bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] animate-pulse' : 'bg-gray-600'}`}></div>
                <div className="absolute inset-2 bg-white rounded-full flex items-center justify-center">
                  <User size={80} className="text-[#FF6B35]" />
                </div>
                {!isMicOn && (
                  <div className="absolute bottom-0 right-0 bg-red-500 rounded-full p-3">
                    <MicOff size={24} className="text-white" />
                  </div>
                )}
              </div>
              <h3 className="text-white text-2xl font-semibold mb-2">You</h3>
              <p className="text-orange-200 text-sm">Speaking {language}</p>
            </div>

            {/* Partner Avatar */}
            <div className="text-center">
              <div className="relative mx-auto w-48 h-48 mb-6">
                {partnerId ? (
                  <>
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#1B3A57] to-[#0F2E4D] animate-pulse"></div>
                    <div className="absolute inset-2 bg-white rounded-full flex items-center justify-center">
                      <User size={80} className="text-[#1B3A57]" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="absolute inset-0 rounded-full bg-gray-700"></div>
                    <div className="absolute inset-2 bg-gray-800 rounded-full flex items-center justify-center">
                      <User size={80} className="text-gray-600" />
                    </div>
                  </>
                )}
              </div>
              <h3 className="text-white text-2xl font-semibold mb-2">
                {partnerId ? 'Partner' : 'Waiting...'}
              </h3>
              <p className="text-purple-200 text-sm">
                {partnerId ? 'Auto-detected language' : 'Finding someone to talk to'}
              </p>
            </div>
          </div>

          {/* Audio Waveform Visualization */}
          {partnerId && isMicOn && (
            <div className="mt-8 flex items-center justify-center space-x-2">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="w-2 bg-[#FF6B35] rounded-full animate-pulse"
                  style={{
                    height: `${Math.random() * 60 + 20}px`,
                    animationDelay: `${i * 0.1}s`
                  }}
                ></div>
              ))}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center space-x-6 mb-8">
          {/* Volume Control */}
          <button
            onClick={toggleVolume}
            className={`p-6 rounded-full transition-all shadow-xl ${
              isVolumeOn 
                ? 'bg-white/20 hover:bg-white/30' 
                : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {isVolumeOn ? (
              <Volume2 size={28} className="text-white" />
            ) : (
              <VolumeX size={28} className="text-white" />
            )}
          </button>

          {/* Mic Control */}
          <button
            onClick={toggleMic}
            className={`p-8 rounded-full transition-all shadow-xl ${
              isMicOn 
                ? 'bg-white/20 hover:bg-white/30' 
                : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {isMicOn ? (
              <Mic size={36} className="text-white" />
            ) : (
              <MicOff size={36} className="text-white" />
            )}
          </button>

          {/* End Call */}
          <button
            onClick={onDisconnect}
            className="p-6 rounded-full bg-red-500 hover:bg-red-600 transition-all shadow-xl"
          >
            <PhoneOff size={28} className="text-white" />
          </button>

          {/* Chat Toggle */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="p-6 rounded-full bg-white/20 hover:bg-white/30 transition-all shadow-xl"
          >
            <MessageSquare size={28} className="text-white" />
          </button>
        </div>

        {/* Call Info */}
        <div className="text-center">
          <p className="text-purple-200 text-sm">
            {isMicOn ? 'Microphone active • ' : 'Microphone muted • '}
            Voice translation enabled
          </p>
        </div>

        {/* Chat Panel (Slide-up) */}
        {isChatOpen && (
          <div className="fixed bottom-0 left-0 right-0 bg-gray-900 rounded-t-3xl shadow-2xl animate-slide-up max-h-96 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold text-lg">Text Chat</h3>
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Messages */}
              <div className="h-48 overflow-y-auto mb-4 space-y-2">
                {messages.length === 0 ? (
                  <p className="text-center text-gray-500 text-sm mt-8">
                    No messages yet. Send a text message to your partner.
                  </p>
                ) : (
                  messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-xl px-4 py-2 ${
                          msg.isOwn
                            ? 'bg-[#FF6B35] text-white'
                            : 'bg-[#1B3A57] text-white'
                        }`}
                      >
                        <p className="text-sm">{msg.text}</p>
                        <p className="text-xs opacity-70 mt-1">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Input */}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
                />
                <button
                  onClick={sendMessage}
                  className="bg-[#FF6B35] hover:bg-[#FF8C5A] text-white rounded-lg px-6 py-3 text-sm font-medium transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
