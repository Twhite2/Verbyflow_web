'use client'

import { useEffect, useRef } from 'react'
import { useConnectionStore } from '@/lib/store'
import { AudioRecorder } from '@/lib/audioUtils'
import { Mic, MicOff, Phone, PhoneOff, Search } from 'lucide-react'

export default function ChatInterface() {
  const {
    status,
    language,
    messages,
    isRecording,
    partnerId,
    voiceSampleCaptured,
    isCapturingVoice,
    setLanguage,
    captureVoiceSample,
    findPartner,
    disconnect,
    toggleRecording,
    sendAudioChunk,
    loadVoiceSample
  } = useConnectionStore()
  
  const audioRecorderRef = useRef<AudioRecorder | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Load voice sample from localStorage on mount (client-side only)
  useEffect(() => {
    loadVoiceSample()
  }, [loadVoiceSample])
  
  // Initialize audio recorder
  useEffect(() => {
    audioRecorderRef.current = new AudioRecorder()
  }, [])
  
  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  
  // Handle recording toggle
  const handleRecordingToggle = async () => {
    if (!audioRecorderRef.current) return
    
    if (isRecording) {
      audioRecorderRef.current.stopRecording()
      toggleRecording()
    } else {
      try {
        await audioRecorderRef.current.startRecording((audioData) => {
          sendAudioChunk(audioData)
        })
        toggleRecording()
      } catch (error) {
        console.error('Failed to start recording:', error)
        alert('Failed to access microphone. Please check permissions.')
      }
    }
  }
  
  const getStatusText = () => {
    switch (status) {
      case 'disconnected':
        return 'Disconnected'
      case 'connecting':
        return 'Connecting...'
      case 'connected':
        return 'Connected - Ready to chat'
      case 'searching':
        return 'Searching for a partner...'
      case 'paired':
        return 'Connected with partner'
      default:
        return 'Unknown'
    }
  }
  
  const getStatusColor = () => {
    switch (status) {
      case 'paired':
        return 'bg-green-500'
      case 'searching':
        return 'bg-yellow-500'
      case 'connected':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }
  
  return (
    <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`} />
            <span className="text-white font-medium">{getStatusText()}</span>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Language selector */}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-white/20 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
              disabled={status === 'paired'}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="pt">Portuguese</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
            </select>
            
            {/* Voice sample capture button */}
            {!voiceSampleCaptured && status !== 'paired' && status !== 'searching' && (
              <button
                onClick={captureVoiceSample}
                disabled={isCapturingVoice}
                className={`bg-white text-purple-600 px-6 py-2 rounded-lg font-medium hover:bg-purple-50 transition-colors flex items-center space-x-2 ${
                  isCapturingVoice ? 'opacity-50 cursor-not-allowed animate-pulse' : ''
                }`}
              >
                <Mic size={20} />
                <span>{isCapturingVoice ? 'Recording voice sample... (10s)' : 'Capture Voice (10s)'}</span>
              </button>
            )}
            
            {/* Find partner and re-capture buttons */}
            {voiceSampleCaptured && status !== 'paired' && status !== 'searching' && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={findPartner}
                  className="bg-white text-purple-600 px-6 py-2 rounded-lg font-medium hover:bg-purple-50 transition-colors flex items-center space-x-2"
                >
                  <Search size={20} />
                  <span>Find Partner</span>
                </button>
                
                {/* Re-capture voice button */}
                <button
                  onClick={captureVoiceSample}
                  disabled={isCapturingVoice}
                  className="bg-purple-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-600 transition-colors flex items-center space-x-2"
                >
                  <Mic size={18} />
                  <span>Re-capture</span>
                </button>
              </div>
            )}
            
            {/* Disconnect button */}
            {status === 'paired' && (
              <button
                onClick={disconnect}
                className="bg-red-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center space-x-2"
              >
                <PhoneOff size={20} />
                <span>Disconnect</span>
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Chat area */}
      <div className="h-[500px] overflow-y-auto p-6 bg-gray-50">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-500">
              <Phone size={64} className="mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-2">No messages yet</p>
              <p className="text-sm">
                {status === 'paired' 
                  ? 'Start speaking to chat with your partner'
                  : 'Find a partner to start chatting'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                    message.isOwn
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-800 shadow-md'
                  }`}
                >
                  <p className="text-sm">{message.text}</p>
                  {message.originalText && (
                    <p className="text-xs mt-1 opacity-70 italic">
                      Original: {message.originalText}
                    </p>
                  )}
                  <p className={`text-xs mt-1 ${message.isOwn ? 'text-indigo-200' : 'text-gray-400'}`}>
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      {/* Controls */}
      <div className="bg-white border-t border-gray-200 p-6">
        <div className="flex items-center justify-center space-x-4">
          {status === 'paired' && (
            <button
              onClick={handleRecordingToggle}
              disabled={status !== 'paired'}
              className={`p-6 rounded-full transition-all shadow-lg ${
                isRecording
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              } ${status !== 'paired' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isRecording ? (
                <MicOff size={32} className="text-white" />
              ) : (
                <Mic size={32} className="text-white" />
              )}
            </button>
          )}
          
          {status !== 'paired' && (
            <p className="text-gray-500 text-sm">
              {status === 'searching'
                ? 'Searching for a partner...'
                : 'Click "Find Partner" to start'}
            </p>
          )}
        </div>
        
        {isRecording && (
          <p className="text-center text-sm text-indigo-600 mt-4 font-medium animate-pulse">
            Recording... Speak now
          </p>
        )}
      </div>
    </div>
  )
}
