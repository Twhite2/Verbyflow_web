'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, User, Settings, MoreVertical, LogOut, Smile, Mic, StopCircle, Play, Pause, X, Globe, Volume2, Bell, Menu } from 'lucide-react'
import { useConnectionStore } from '@/lib/store'
import dynamic from 'next/dynamic'
import type { EmojiClickData } from 'emoji-picker-react'
import VoiceNotePlayer from './VoiceNotePlayer'
import { AudioPlayback } from '@/lib/audioPlayback'

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false })

interface TextChatInterfaceProps {
  language: string
  onDisconnect: () => void
}

export default function TextChatInterface({ language, onDisconnect }: TextChatInterfaceProps) {
  const [message, setMessage] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isRecordingVoiceNote, setIsRecordingVoiceNote] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const audioPlaybackRef = useRef<AudioPlayback | null>(null)
  const hasCalledFindPartnerRef = useRef(false)
  
  // Zustand store
  const status = useConnectionStore(state => state.status)
  const partnerId = useConnectionStore(state => state.partnerId)
  const messages = useConnectionStore(state => state.messages)
  const isPartnerTyping = useConnectionStore(state => state.isPartnerTyping)
  const sendTextMessage = useConnectionStore(state => state.sendTextMessage)
  const sendVoiceNote = useConnectionStore(state => state.sendVoiceNote)
  const sendTypingIndicator = useConnectionStore(state => state.sendTypingIndicator)
  const initialize = useConnectionStore(state => state.initialize)
  const findPartner = useConnectionStore(state => state.findPartner)
  const disconnect = useConnectionStore(state => state.disconnect)
  const clearMessages = useConnectionStore(state => state.clearMessages)
  
  // Initialize AudioPlayback for voice note TTS playback
  useEffect(() => {
    // Create AudioPlayback ONCE and keep it on window permanently
    if (!(window as any).audioPlayback) {
      console.log('🔊 Creating AudioPlayback instance for text chat')
      const playback = new AudioPlayback()
      audioPlaybackRef.current = playback
      ;(window as any).audioPlayback = playback
    } else {
      // Reuse existing instance
      console.log('🔊 Reusing existing AudioPlayback instance')
      audioPlaybackRef.current = (window as any).audioPlayback
    }
    
    return () => {
      // DON'T delete window.audioPlayback - keep it for voice note chunks
      if (audioPlaybackRef.current) {
        console.log('🛑 Stopping playback (keeping instance)')
        audioPlaybackRef.current.stop()
      }
    }
  }, [])
  
  // NOTE: WebSocket initialization is handled by page.tsx when mode is selected
  // Do NOT call initialize() here - it causes duplicate connections
  
  // Auto-find partner when connected
  useEffect(() => {
    if (status === 'connected' && !hasCalledFindPartnerRef.current) {
      console.log('🔍 Auto-calling findPartner (first time only)')
      hasCalledFindPartnerRef.current = true
      findPartner()
    } else if (status === 'disconnected') {
      // Reset flag when disconnected so we can find partner again on reconnect
      hasCalledFindPartnerRef.current = false
    }
  }, [status, findPartner])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  
  // Typing indicator
  useEffect(() => {
    if (message.trim()) {
      sendTypingIndicator(true)
    } else {
      sendTypingIndicator(false)
    }
  }, [message])

  const handleSendMessage = () => {
    if (message.trim() && status === 'paired') {
      sendTextMessage(message)
      setMessage('')
      sendTypingIndicator(false)
    }
  }
  
  const handleDisconnect = () => {
    disconnect()
    onDisconnect()
  }

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prev => prev + emojiData.emoji)
    setShowEmojiPicker(false)
  }

  const startVoiceNoteRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.onloadend = () => {
          const base64Audio = reader.result as string
          const base64Data = base64Audio.split(',')[1]
          sendVoiceNote(base64Data)
        }
        reader.readAsDataURL(audioBlob)
        
        stream.getTracks().forEach(track => track.stop())
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
        }
        setRecordingTime(0)
      }

      mediaRecorder.start()
      setIsRecordingVoiceNote(true)
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } catch (error) {
      console.error('Failed to start voice note recording:', error)
      alert('Failed to access microphone')
    }
  }

  const stopVoiceNoteRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setIsRecordingVoiceNote(false)
    }
  }

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }, [])

  return (
      <div className="h-screen bg-gradient-to-br from-[#FF6B35] to-[#1B3A57] flex relative overflow-hidden">
        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Language Setting */}
                <div>
                  <div className="flex items-center space-x-3 mb-2">
                    <Globe size={20} className="text-[#FF6B35]" />
                    <h3 className="text-lg font-semibold text-gray-900">Your Language</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">Current: {language}</p>
                  <p className="text-xs text-gray-500">To change language, disconnect and select a new language before reconnecting</p>
                </div>

                {/* Notifications */}
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Bell size={20} className="text-[#FF6B35]" />
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
                        <p className="text-sm text-gray-600">Sound alerts for new messages</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FF6B35]"></div>
                    </label>
                  </div>
                </div>

                {/* Audio Settings */}
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Volume2 size={20} className="text-[#FF6B35]" />
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Auto-play Audio</h3>
                        <p className="text-sm text-gray-600">Play voice notes automatically</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FF6B35]"></div>
                    </label>
                  </div>
                </div>

                {/* About */}
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    <strong>VerbyFlow</strong> - Real-time translation chat
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Connect beyond language barriers with instant message translation and voice notes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sidebar Overlay (mobile) */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`fixed inset-y-0 left-0 z-40 w-72 sm:w-80 bg-gradient-to-b from-[#1B3A57] to-[#0F2E4D] p-4 sm:p-6 flex flex-col space-y-4 sm:space-y-6 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:w-80 xl:w-96 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Close button (mobile) */}
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden self-end p-1 text-white/70 hover:text-white"
          >
            <X size={20} />
          </button>

          {/* User Info */}
          <div className="mb-4 sm:mb-8">
            <div className="bg-white rounded-xl p-3 sm:p-4 mb-3 sm:mb-4 shadow-lg">
              <img src="/verbyflow-logo.png" alt="VerbyFlow" className="h-10 sm:h-14 w-auto mx-auto" />
            </div>
            <p className="text-white/80 text-sm font-medium">Text Chat Mode</p>
          </div>

          {/* Status */}
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex items-center space-x-3 mb-3">
              <div className={`w-2 h-2 rounded-full ${status === 'paired' ? 'bg-green-400 animate-pulse' : status === 'searching' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-400'}`}></div>
              <span className="text-white font-medium">
                {status === 'paired' ? 'Connected' : status === 'searching' ? 'Finding Partner...' : 'Connecting...'}
              </span>
            </div>
            <p className="text-white/80 text-sm">
              Your language: <span className="font-semibold">{language}</span>
            </p>
          </div>

          {/* Participants */}
          <div className="flex-1">
            <h3 className="text-white font-semibold mb-4">Participants</h3>
            <div className="space-y-3">
              {/* You */}
              <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 flex items-center space-x-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                  <User size={20} className="text-[#FF6B35]" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium text-sm">You</p>
                  <p className="text-white/70 text-xs">{language}</p>
                </div>
              </div>

              {/* Partner */}
              {partnerId ? (
                <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                    <User size={20} className="text-[#1B3A57]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium text-sm">Partner</p>
                    <p className="text-white/70 text-xs">Auto-detected</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border-2 border-dashed border-white/30">
                  <p className="text-white/60 text-sm text-center">
                    Searching for partner...
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Disconnect Button */}
          <button
            onClick={() => { handleDisconnect(); setIsSidebarOpen(false) }}
            className="w-full bg-red-500 hover:bg-red-600 text-white rounded-lg py-2.5 sm:py-3 font-semibold transition-colors flex items-center justify-center space-x-2 text-sm sm:text-base"
          >
            <LogOut size={18} />
            <span>Leave Chat</span>
          </button>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
            {/* Sidebar toggle (mobile) */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            >
              <Menu size={20} className="text-gray-600" />
            </button>
            <div className="min-w-0 flex-1">
              <h3 className="text-gray-900 text-base sm:text-lg font-semibold truncate">
                {partnerId ? 'Chatting with Partner' : 'Waiting for Partner'}
              </h3>
              <p className="text-gray-500 text-xs sm:text-sm hidden sm:block">
                Messages are automatically translated
              </p>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-2 relative shrink-0">
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Settings size={20} className="text-gray-600" />
              </button>
              <button 
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <MoreVertical size={20} className="text-gray-600" />
              </button>
              
              {/* Menu Dropdown */}
              {showMenu && (
                <div className="absolute top-12 right-0 bg-white rounded-lg shadow-xl border border-gray-200 py-2 w-48 z-50">
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      setShowSettings(true)
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
                  >
                    <Settings size={16} className="text-gray-600" />
                    <span className="text-sm text-gray-700">Settings</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      if (confirm('Clear all messages from this chat?')) {
                        clearMessages()
                      }
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
                  >
                    <X size={16} className="text-gray-600" />
                    <span className="text-sm text-gray-700">Clear Messages</span>
                  </button>
                  <div className="border-t border-gray-200 my-2"></div>
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      handleDisconnect()
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center space-x-3"
                  >
                    <LogOut size={16} className="text-red-600" />
                    <span className="text-sm text-red-600">Leave Chat</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-gray-50">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-[#FF6B35] to-[#1B3A57] rounded-full mx-auto mb-4 flex items-center justify-center">
                    <Send size={32} className="text-white" />
                  </div>
                  <h4 className="text-gray-900 text-lg font-semibold mb-2">
                    No messages yet
                  </h4>
                  <p className="text-gray-500 text-sm max-w-xs">
                    {partnerId 
                      ? 'Start the conversation by sending a message below'
                      : 'Waiting for a partner to join...'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[70%] ${msg.isOwn ? 'order-2' : 'order-1'}`}>
                      {/* Message Bubble */}
                      <div
                        className={`rounded-2xl px-5 py-3 ${
                          msg.isOwn
                            ? 'bg-gradient-to-br from-[#FF6B35] to-[#1B3A57] text-white'
                            : 'bg-white text-gray-900 shadow-md'
                        }`}
                      >
                        {msg.voiceNote || msg.audioData ? (
                          <>
                            <VoiceNotePlayer audioData={(msg.voiceNote || msg.audioData)!} isOwn={msg.isOwn} />
                            {/* Show translated text below audio player for received voice notes */}
                            {!msg.isOwn && msg.type === 'voice_note' && msg.text && (
                              <p className="text-sm leading-relaxed mt-3">{msg.text}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm leading-relaxed">{msg.text}</p>
                        )}
                        
                        {/* Original text (for received messages) */}
                        {!msg.isOwn && msg.originalText && msg.originalText !== msg.text && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <p className="text-xs text-gray-500 mb-1">Original:</p>
                            <p className="text-sm italic opacity-75">{msg.originalText}</p>
                          </div>
                        )}
                      </div>
                      
                      {/* Timestamp */}
                      <p className={`text-xs text-gray-400 mt-1 px-2 ${
                        msg.isOwn ? 'text-right' : 'text-left'
                      }`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      msg.isOwn 
                        ? 'bg-gradient-to-br from-[#FF6B35] to-[#1B3A57] order-1 ml-3' 
                        : 'bg-gray-300 order-2 mr-3'
                    }`}>
                      <User size={16} className="text-white" />
                    </div>
                  </div>
                ))}
                
                {/* Typing indicator */}
                {isPartnerTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white shadow-md rounded-2xl px-5 py-3">
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Message Input */}
          <div className="bg-white border-t border-gray-200 p-3 sm:p-4 lg:p-6">
            {/* Voice Recording Indicator */}
            {isRecordingVoiceNote && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shrink-0"></div>
                  <span className="text-red-700 font-medium text-sm truncate">Recording...</span>
                  <span className="text-red-600 text-sm shrink-0">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
                </div>
                <button
                  onClick={stopVoiceNoteRecording}
                  className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-3 sm:px-4 py-2 font-medium flex items-center space-x-1 sm:space-x-2 text-sm shrink-0"
                >
                  <StopCircle size={16} />
                  <span className="hidden sm:inline">Stop & Send</span>
                  <span className="sm:hidden">Stop</span>
                </button>
              </div>
            )}
            
            <div className="flex items-end gap-2 sm:gap-3">
              {/* Emoji Picker Button */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  disabled={status !== 'paired' || isRecordingVoiceNote}
                  className="p-2 sm:p-3 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Smile size={20} className="text-gray-600 sm:w-6 sm:h-6" />
                </button>
                {showEmojiPicker && (
                  <div className="absolute bottom-full left-0 mb-2 z-50">
                    <EmojiPicker onEmojiClick={handleEmojiClick} />
                  </div>
                )}
              </div>
              
              {/* Voice Note Button */}
              <button
                onClick={startVoiceNoteRecording}
                disabled={status !== 'paired' || isRecordingVoiceNote}
                className="p-2 sm:p-3 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <Mic size={20} className="text-gray-600 sm:w-6 sm:h-6" />
              </button>
              
              <div className="flex-1 min-w-0">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder={status === 'paired' ? "Type your message..." : status === 'searching' ? "Finding partner..." : "Connecting..."}
                  disabled={status !== 'paired' || isRecordingVoiceNote}
                  rows={2}
                  className="w-full bg-gray-50 text-gray-900 rounded-xl sm:rounded-2xl px-3 sm:px-5 py-2.5 sm:py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#FF6B35] disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-1 px-2 hidden sm:block">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
              <button
                onClick={handleSendMessage}
                disabled={status !== 'paired' || !message.trim() || isRecordingVoiceNote}
                className="bg-gradient-to-br from-[#FF6B35] to-[#1B3A57] hover:from-[#FF8C5A] hover:to-[#0F2E4D] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl sm:rounded-2xl p-3 sm:px-6 sm:py-3 font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 shrink-0"
              >
                <Send size={18} />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </div>
        </div>
      </div>
  )
}
