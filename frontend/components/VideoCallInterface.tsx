'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  Video, VideoOff, Mic, MicOff, Phone, PhoneOff, 
  MessageSquare, Users, Settings, MoreVertical,
  Maximize2, Volume2, VolumeX
} from 'lucide-react'
import { WebRTCManager } from '@/lib/webrtc'
import { useConnectionStore } from '@/lib/store'

interface VideoCallInterfaceProps {
  language: string
  onDisconnect: () => void
}

export default function VideoCallInterface({ language, onDisconnect }: VideoCallInterfaceProps) {
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isChatOpen, setIsChatOpen] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Array<{ text: string; isOwn: boolean; time: string }>>([])
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new')
  const [isInitiator, setIsInitiator] = useState(false)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const webrtcManagerRef = useRef<WebRTCManager | null>(null)
  
  // Zustand store
  const status = useConnectionStore(state => state.status)
  const partnerId = useConnectionStore(state => state.partnerId)
  const sendWebRTCOffer = useConnectionStore(state => state.sendWebRTCOffer)
  const sendWebRTCAnswer = useConnectionStore(state => state.sendWebRTCAnswer)
  const sendWebRTCIceCandidate = useConnectionStore(state => state.sendWebRTCIceCandidate)
  const setWebRTCCallbacks = useConnectionStore(state => state.setWebRTCCallbacks)
  const disconnect = useConnectionStore(state => state.disconnect)

  useEffect(() => {
    // Initialize WebRTC manager
    const initWebRTC = async () => {
      try {
        console.log('🎥 Initializing WebRTC...')
        
        // Create WebRTC manager with callbacks
        webrtcManagerRef.current = new WebRTCManager(
          undefined,
          {
            onLocalStream: (stream) => {
              console.log('✅ Local stream ready')
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream
              }
            },
            onRemoteStream: (stream) => {
              console.log('✅ Remote stream ready')
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = stream
              }
            },
            onConnectionStateChange: (state) => {
              console.log('🔄 Connection state:', state)
              setConnectionState(state)
            },
            onIceCandidate: (candidate) => {
              console.log('🧊 Local ICE candidate')
              sendWebRTCIceCandidate(candidate.toJSON())
            }
          }
        )
        
        // Get local media stream
        await webrtcManagerRef.current.initLocalStream()
        
      } catch (error) {
        console.error('❌ Failed to initialize WebRTC:', error)
      }
    }
    
    initWebRTC()

    return () => {
      // Cleanup WebRTC resources
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.cleanup()
      }
    }
  }, [])
  
  // Set up WebRTC signaling callbacks
  useEffect(() => {
    setWebRTCCallbacks({
      onWebRTCOffer: async (offer, fromUser) => {
        console.log('📹 Received offer from', fromUser)
        if (!webrtcManagerRef.current) return
        
        try {
          webrtcManagerRef.current.createPeerConnection()
          const answer = await webrtcManagerRef.current.createAnswer(offer)
          sendWebRTCAnswer(answer)
          console.log('✅ Answer sent')
        } catch (error) {
          console.error('❌ Failed to handle offer:', error)
        }
      },
      
      onWebRTCAnswer: async (answer, fromUser) => {
        console.log('📹 Received answer from', fromUser)
        if (!webrtcManagerRef.current) return
        
        try {
          await webrtcManagerRef.current.setRemoteAnswer(answer)
          console.log('✅ Answer applied')
        } catch (error) {
          console.error('❌ Failed to handle answer:', error)
        }
      },
      
      onWebRTCIceCandidate: async (candidate, fromUser) => {
        console.log('🧊 Received ICE candidate from', fromUser)
        if (!webrtcManagerRef.current) return
        
        try {
          await webrtcManagerRef.current.addIceCandidate(candidate)
        } catch (error) {
          console.error('❌ Failed to add ICE candidate:', error)
        }
      }
    })
  }, [setWebRTCCallbacks, sendWebRTCAnswer, sendWebRTCIceCandidate])
  
  // Initiate call when paired
  useEffect(() => {
    if (status === 'paired' && partnerId && webrtcManagerRef.current) {
      const initiateCall = async () => {
        try {
          console.log('📞 Initiating video call with', partnerId)
          setIsInitiator(true)
          
          webrtcManagerRef.current!.createPeerConnection()
          const offer = await webrtcManagerRef.current!.createOffer()
          sendWebRTCOffer(offer)
          console.log('✅ Offer sent')
        } catch (error) {
          console.error('❌ Failed to initiate call:', error)
        }
      }
      
      // Small delay to ensure both peers are ready
      setTimeout(initiateCall, 1000)
    }
  }, [status, partnerId, sendWebRTCOffer])

  const toggleCamera = () => {
    if (webrtcManagerRef.current) {
      const newState = !isCameraOn
      webrtcManagerRef.current.toggleVideo(newState)
      setIsCameraOn(newState)
    }
  }

  const toggleMic = () => {
    if (webrtcManagerRef.current) {
      const newState = !isMicOn
      webrtcManagerRef.current.toggleAudio(newState)
      setIsMicOn(newState)
    }
  }

  const sendMessage = () => {
    if (message.trim()) {
      setMessages([...messages, { 
        text: message, 
        isOwn: true, 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }])
      setMessage('')
    }
  }

  return (
    <div className="h-screen bg-gray-900 flex">
      {/* Main Video Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className="bg-white rounded-lg px-3 py-2 shadow-md">
              <img src="/verbyflow-logo.png" alt="VerbyFlow" className="h-10 w-auto" />
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-white font-medium">Connected</span>
              <span className="text-gray-400 text-sm">• Translation: {language} ↔ Auto-detect</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Settings size={20} className="text-gray-300" />
            </button>
            <button className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
              <MoreVertical size={20} className="text-gray-300" />
            </button>
          </div>
        </div>

        {/* Video Grid */}
        <div className="flex-1 relative p-4">
          {/* Remote Video (Partner) */}
          <div className="absolute inset-4 bg-gray-800 rounded-2xl overflow-hidden">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {!partnerId && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1B3A57]">
                <div className="text-center">
                  <div className="w-24 h-24 bg-gray-700 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <Users size={48} className="text-gray-500" />
                  </div>
                  <p className="text-white text-lg font-medium mb-2">Waiting for partner...</p>
                  <p className="text-gray-400 text-sm">Searching for someone to connect with</p>
                </div>
              </div>
            )}
            
            {/* Partner name overlay */}
            {partnerId && (
              <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg">
                <p className="text-white font-medium">Partner</p>
              </div>
            )}
          </div>

          {/* Local Video (You) - Picture in Picture */}
          <div className="absolute top-8 right-8 w-64 h-48 bg-[#1B3A57] rounded-xl overflow-hidden shadow-2xl border-2 border-gray-600">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {!isCameraOn && (
              <div className="absolute inset-0 bg-[#1B3A57] flex items-center justify-center">
                <div className="text-center">
                  <VideoOff size={32} className="text-gray-500 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">Camera off</p>
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-lg">
              <p className="text-white text-sm font-medium">You</p>
            </div>
          </div>

          {/* Settings Panel Overlay */}
          {isSettingsOpen && (
            <div className="absolute top-20 right-8 w-80 bg-[#1B3A57] rounded-xl shadow-2xl border border-gray-700 p-4">
              <h3 className="text-white font-semibold mb-4">Settings</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-sm">Noise suppression</span>
                  <button className="w-12 h-6 bg-[#FF6B35] rounded-full relative">
                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-sm">Video stabilization</span>
                  <button className="w-12 h-6 bg-[#FF6B35] rounded-full relative">
                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-sm">Auto-translate voice</span>
                  <button className="w-12 h-6 bg-[#FF6B35] rounded-full relative">
                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls Bar */}
        <div className="bg-[#1B3A57] border-t border-gray-700 px-6 py-6">
          <div className="flex items-center justify-center space-x-4">
            {/* Mic Toggle */}
            <button
              onClick={toggleMic}
              className={`p-4 rounded-full transition-all ${
                isMicOn 
                  ? 'bg-gray-700 hover:bg-gray-600' 
                  : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              {isMicOn ? (
                <Mic size={24} className="text-white" />
              ) : (
                <MicOff size={24} className="text-white" />
              )}
            </button>

            {/* Camera Toggle */}
            <button
              onClick={toggleCamera}
              className={`p-4 rounded-full transition-all ${
                isCameraOn 
                  ? 'bg-gray-700 hover:bg-gray-600' 
                  : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              {isCameraOn ? (
                <Video size={24} className="text-white" />
              ) : (
                <VideoOff size={24} className="text-white" />
              )}
            </button>

            {/* End Call */}
            <button
              onClick={onDisconnect}
              className="p-4 rounded-full bg-red-500 hover:bg-red-600 transition-all"
            >
              <PhoneOff size={24} className="text-white" />
            </button>

            {/* Toggle Chat */}
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 transition-all"
            >
              <MessageSquare size={24} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Chat Sidebar */}
      {isChatOpen && (
        <div className="w-96 bg-[#1B3A57] border-l border-gray-700 flex flex-col">
          {/* Chat Header */}
          <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-semibold">Chat</h3>
            <button
              onClick={() => setIsChatOpen(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <MessageSquare size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">No messages yet</p>
                <p className="text-xs mt-1">Send a text message to your partner</p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                      msg.isOwn
                        ? 'bg-[#FF6B35] text-white'
                        : 'bg-gray-700 text-white'
                    }`}
                  >
                    <p className="text-sm">{msg.text}</p>
                    <p className="text-xs opacity-70 mt-1">{msg.time}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Message Input */}
          <div className="p-4 border-t border-gray-700">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Send a message..."
                className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
              />
              <button
                onClick={sendMessage}
                className="bg-[#FF6B35] hover:bg-[#FF8C5A] text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
