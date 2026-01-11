'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX,
  User, MessageSquare, Settings, MoreVertical
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
  const [isCapturingVoice, setIsCapturingVoice] = useState(false)
  const [captureProgress, setCaptureProgress] = useState(0)
  const [partialTranscript, setPartialTranscript] = useState('')
  
  const audioWorkletRef = useRef<AudioWorkletCapture | null>(null)
  const audioPlaybackRef = useRef<AudioPlayback | null>(null)
  
  // Zustand store
  const status = useConnectionStore(state => state.status)
  const partnerId = useConnectionStore(state => state.partnerId)
  const voiceSampleCaptured = useConnectionStore(state => state.voiceSampleCaptured)
  const messages = useConnectionStore(state => state.messages)
  const captureVoiceSample = useConnectionStore(state => state.captureVoiceSample)
  const findPartner = useConnectionStore(state => state.findPartner)
  const disconnect = useConnectionStore(state => state.disconnect)
  const sendAudioChunk = useConnectionStore(state => state.sendAudioChunk)
  const loadVoiceSample = useConnectionStore(state => state.loadVoiceSample)
  const storedVoiceSample = useConnectionStore(state => state.storedVoiceSample)
  const initialize = useConnectionStore(state => state.initialize)
  
  // Initialize WebSocket connection on mount
  useEffect(() => {
    console.log('🎤 AudioCallInterface mount - status:', status)
    if (status === 'disconnected') {
      console.log('🎤 Initializing WebSocket...')
      initialize()
    }
  }, [])
  
  // Load voice sample from localStorage on mount (client-side only)
  useEffect(() => {
    console.log('🎤 Loading voice sample...')
    loadVoiceSample()
  }, [])
  
  // Log status changes
  useEffect(() => {
    console.log('🎤 Status changed to:', status)
  }, [status])
  
  // Auto-find partner when connected AND voice sample is ready
  useEffect(() => {
    if (status === 'connected' && voiceSampleCaptured && storedVoiceSample) {
      console.log('🎤 Auto-finding partner (connected + voice sample ready)')
      // Small delay to ensure WebSocket is fully ready
      setTimeout(() => {
        findPartner()
      }, 500)
    }
  }, [status, voiceSampleCaptured, storedVoiceSample])
  
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
    if (!audioPlaybackRef.current) {
      audioPlaybackRef.current = new AudioPlayback()
      // Expose to window for WebSocket message handler
      ;(window as any).audioPlayback = audioPlaybackRef.current
    }
    
    return () => {
      // Cleanup on unmount
      if (audioPlaybackRef.current) {
        audioPlaybackRef.current.stop()
      }
      delete (window as any).audioPlayback
    }
  }, [])
  
  const toggleMic = () => {
    setIsMicOn(!isMicOn)
  }
  
  const toggleVolume = () => setIsVolumeOn(!isVolumeOn)
  
  const handleCaptureVoice = async () => {
    setIsCapturingVoice(true)
    setCaptureProgress(0)
    
    // Progress animation
    const progressInterval = setInterval(() => {
      setCaptureProgress(prev => Math.min(prev + 10, 100))
    }, 1000)
    
    try {
      await captureVoiceSample()
    } finally {
      clearInterval(progressInterval)
      setIsCapturingVoice(false)
      setCaptureProgress(0)
    }
  }
  
  const handleFindPartner = () => {
    console.log('🎤 Find Partner button clicked')
    console.log('🎤 Current state:', { status, voiceSampleCaptured, storedVoiceSample: !!storedVoiceSample })
    findPartner()
  }
  
  const handleDisconnect = () => {
    stopAudioRecording()
    disconnect()
    onDisconnect()
  }

  const sendMessage = () => {
    if (message.trim()) {
      // Text messages not implemented yet - just for UI
      setMessage('')
    }
  }

  // Show voice sample capture UI ONLY if voice sample not captured yet
  // Once we have a voice sample, always show the call screen (even while searching)
  const showSetup = (status === 'disconnected' || status === 'connecting' || status === 'connected' || status === 'searching') && !voiceSampleCaptured
  
  console.log('🎤 UI Decision:', { 
    showSetup, 
    status, 
    voiceSampleCaptured, 
    storedVoiceSample: !!storedVoiceSample 
  })
  
  if (showSetup) {
    return (
      <div className="h-screen bg-gradient-to-br from-[#1B3A57] via-[#0F2E4D] to-[#FF6B35] flex items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-12">
            <div className="inline-block bg-white rounded-2xl px-6 py-4 mb-6 shadow-2xl">
              <img src="/verbyflow-logo.png" alt="VerbyFlow" className="h-16 w-auto" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">Audio Call Mode</h1>
            <p className="text-xl text-white/90">Real-time voice translation with AI</p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8">
            <div className="text-center mb-8">
              <div className="w-24 h-24 bg-[#FF6B35] rounded-full mx-auto mb-6 flex items-center justify-center">
                <Mic size={48} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">
                {storedVoiceSample ? 'Voice Sample Ready' : 'Capture Your Voice'}
              </h2>
              <p className="text-white/80 mb-6">
                {storedVoiceSample 
                  ? 'You already have a voice sample saved. Click below to find a partner.'
                  : 'Record a 10-second sample so your partner hears your voice when translated'
                }
              </p>
              
              {isCapturingVoice && (
                <div className="mb-6">
                  <div className="w-full bg-white/20 rounded-full h-3 mb-2">
                    <div 
                      className="bg-[#FF6B35] h-3 rounded-full transition-all duration-1000"
                      style={{ width: `${captureProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-white/90 text-sm">Recording... {Math.floor(captureProgress / 10)}s / 10s</p>
                </div>
              )}
            </div>

            {!storedVoiceSample ? (
              <button
                onClick={handleCaptureVoice}
                disabled={isCapturingVoice}
                className="w-full bg-[#FF6B35] hover:bg-[#FF8C5A] disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-semibold text-lg transition-colors shadow-lg"
              >
                {isCapturingVoice ? 'Recording...' : 'Record Voice Sample'}
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleFindPartner}
                  disabled={status === 'searching' || status === 'connecting'}
                  className="w-full bg-[#FF6B35] hover:bg-[#FF8C5A] disabled:opacity-50 text-white py-4 rounded-xl font-semibold text-lg transition-colors shadow-lg"
                >
                  {status === 'searching' ? 'Finding Partner...' : 'Find Partner'}
                </button>
                <button
                  onClick={handleCaptureVoice}
                  disabled={isCapturingVoice}
                  className="w-full bg-white/20 hover:bg-white/30 text-white py-3 rounded-xl font-medium transition-colors"
                >
                  Re-record Voice Sample
                </button>
              </div>
            )}
          </div>

          <div className="text-center mt-8">
            <button
              onClick={handleDisconnect}
              className="text-white/80 hover:text-white transition-colors"
            >
              ← Back to Mode Selection
            </button>
          </div>
        </div>
      </div>
    )
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
