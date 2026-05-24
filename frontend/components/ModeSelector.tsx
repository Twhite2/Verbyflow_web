'use client'

import { Video, Phone, MessageSquare } from 'lucide-react'

interface ModeSelectorProps {
  onModeSelect: (mode: 'video' | 'audio' | 'text') => void
}

export default function ModeSelector({ onModeSelect }: ModeSelectorProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B3A57] via-[#0F2E4D] to-[#FF6B35] flex items-center justify-center p-4">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="bg-white rounded-2xl px-8 py-6 shadow-2xl transform hover:scale-105 transition-transform">
              <img 
                src="/verbyflow-logo.png" 
                alt="VerbyFlow" 
                className="h-28 w-auto"
              />
            </div>
          </div>
          <p className="text-2xl text-white/90 font-medium">Connect beyond language barriers</p>
          <p className="text-lg text-white/70 mt-2">Choose your communication mode</p>
        </div>

        {/* Mode Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Video Call Mode */}
          <div
            onClick={() => onModeSelect('video')}
            className="group bg-white rounded-2xl p-8 cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-2xl"
          >
            <div className="bg-gradient-to-br from-[#1B3A57] to-[#0F2E4D] w-20 h-20 rounded-2xl flex items-center justify-center mb-6">
              <Video size={40} className="text-white" />
            </div>
            <h3 className="text-2xl font-bold font-display text-gray-900 mb-3">Video Call</h3>
            <p className="text-gray-600 mb-4">
              Face-to-face conversation with real-time translation and video streaming
            </p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 bg-[#1B3A57] rounded-full mr-2"></span>
                HD video quality
              </li>
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 bg-[#1B3A57] rounded-full mr-2"></span>
                Voice translation
              </li>
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 bg-[#1B3A57] rounded-full mr-2"></span>
                Text chat sidebar
              </li>
            </ul>
            <button className="mt-6 w-full bg-[#1B3A57] text-white py-3 rounded-xl font-semibold hover:bg-[#0F2E4D] transition-colors">
              Start Video Call
            </button>
          </div>

          {/* Audio Call Mode */}
          <div
            onClick={() => onModeSelect('audio')}
            className="group bg-white rounded-2xl p-8 cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-2xl"
          >
            <div className="bg-gradient-to-br from-[#FF6B35] to-[#FF8C5A] w-20 h-20 rounded-2xl flex items-center justify-center mb-6">
              <Phone size={40} className="text-white" />
            </div>
            <h3 className="text-2xl font-bold font-display text-gray-900 mb-3">Audio Call</h3>
            <p className="text-gray-600 mb-4">
              Voice-only conversation with real-time translation using multilingual voices
            </p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 bg-[#FF6B35] rounded-full mr-2"></span>
                Predefined multilingual voices
              </li>
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 bg-[#FF6B35] rounded-full mr-2"></span>
                Low bandwidth
              </li>
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 bg-[#FF6B35] rounded-full mr-2"></span>
                Focus mode
              </li>
            </ul>
            <button className="mt-6 w-full bg-[#FF6B35] text-white py-3 rounded-xl font-semibold hover:bg-[#FF8C5A] transition-colors">
              Start Audio Call
            </button>
          </div>

          {/* Text Chat Mode */}
          <div
            onClick={() => onModeSelect('text')}
            className="group bg-white rounded-2xl p-8 cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-2xl"
          >
            <div className="bg-gradient-to-br from-[#FF6B35] to-[#1B3A57] w-20 h-20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <MessageSquare size={40} className="text-white" />
            </div>
            <h3 className="text-2xl font-bold font-display text-gray-900 mb-3">Text Chat</h3>
            <p className="text-gray-600 mb-4">
              Traditional messaging with instant translation for written communication
            </p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 bg-[#FF6B35] rounded-full mr-2"></span>
                Instant translation
              </li>
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 bg-[#FF6B35] rounded-full mr-2"></span>
                Message history
              </li>
              <li className="flex items-center">
                <span className="w-1.5 h-1.5 bg-[#FF6B35] rounded-full mr-2"></span>
                Lightweight
              </li>
            </ul>
            <button className="mt-6 w-full bg-[#FF6B35] text-white py-3 rounded-xl font-semibold hover:bg-[#FF8C5A] transition-colors">
              Start Text Chat
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12">
          <p className="text-white/60 text-sm">
            Anonymous • Secure • No registration required
          </p>
        </div>
      </div>
    </div>
  )
}
