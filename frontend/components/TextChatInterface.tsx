'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, User, Settings, MoreVertical, LogOut } from 'lucide-react'
import { useConnectionStore } from '@/lib/store'

interface TextChatInterfaceProps {
  language: string
  onDisconnect: () => void
}

export default function TextChatInterface({ language, onDisconnect }: TextChatInterfaceProps) {
  const [message, setMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Zustand store
  const status = useConnectionStore(state => state.status)
  const partnerId = useConnectionStore(state => state.partnerId)
  const messages = useConnectionStore(state => state.messages)
  const isPartnerTyping = useConnectionStore(state => state.isPartnerTyping)
  const sendTextMessage = useConnectionStore(state => state.sendTextMessage)
  const sendTypingIndicator = useConnectionStore(state => state.sendTypingIndicator)
  const initialize = useConnectionStore(state => state.initialize)
  const findPartner = useConnectionStore(state => state.findPartner)
  const disconnect = useConnectionStore(state => state.disconnect)
  
  // Initialize WebSocket connection
  useEffect(() => {
    if (status === 'disconnected') {
      initialize()
    }
  }, [])
  
  // Auto-find partner when connected
  useEffect(() => {
    if (status === 'connected') {
      findPartner()
    }
  }, [status])

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

  return (
    <div className="h-screen bg-gradient-to-br from-orange-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-5xl w-full h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex">
        {/* Sidebar */}
        <div className="w-80 bg-gradient-to-b from-[#FF6B35] to-[#1B3A57] p-6 flex flex-col">
          {/* User Info */}
          <div className="mb-8">
            <div className="bg-white rounded-xl p-4 mb-4 shadow-lg">
              <img src="/verbyflow-logo.png" alt="VerbyFlow" className="h-14 w-auto mx-auto" />
            </div>
            <p className="text-white/80 text-sm font-medium">Text Chat Mode</p>
          </div>

          {/* Status */}
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 mb-6">
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
            onClick={handleDisconnect}
            className="w-full bg-red-500 hover:bg-red-600 text-white rounded-lg py-3 font-semibold transition-colors flex items-center justify-center space-x-2"
          >
            <LogOut size={20} />
            <span>Leave Chat</span>
          </button>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-gray-900 text-lg font-semibold">
                {partnerId ? 'Chatting with Partner' : 'Waiting for Partner'}
              </h3>
              <p className="text-gray-500 text-sm">
                Messages are automatically translated
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Settings size={20} className="text-gray-600" />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <MoreVertical size={20} className="text-gray-600" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
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
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                        
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
          <div className="bg-white border-t border-gray-200 p-6">
            <div className="flex items-end space-x-3">
              <div className="flex-1">
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
                  disabled={status !== 'paired'}
                  rows={3}
                  className="w-full bg-gray-50 text-gray-900 rounded-2xl px-5 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#FF6B35] disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-2 px-2">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
              <button
                onClick={handleSendMessage}
                disabled={status !== 'paired' || !message.trim()}
                className="bg-gradient-to-br from-[#FF6B35] to-[#1B3A57] hover:from-[#FF8C5A] hover:to-[#0F2E4D] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl px-8 py-4 font-semibold transition-all shadow-lg hover:shadow-xl flex items-center space-x-2"
              >
                <Send size={20} />
                <span>Send</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
