'use client'

import { useState, useEffect } from 'react'
import { Globe } from 'lucide-react'
import ModeSelector from '@/components/ModeSelector'
import VideoCallInterface from '@/components/VideoCallInterface'
import AudioCallInterface from '@/components/AudioCallInterface'
import TextChatInterface from '@/components/TextChatInterface'
import { useConnectionStore } from '@/lib/store'

type CommunicationMode = 'video' | 'audio' | 'text' | null

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'ko', name: 'Korean' },
  { code: 'hi', name: 'Hindi' },
]

export default function Home() {
  const [selectedMode, setSelectedMode] = useState<CommunicationMode>(null)
  const [showLanguageSelect, setShowLanguageSelect] = useState(false)
  
  const language = useConnectionStore((state) => state.language)
  const setLanguage = useConnectionStore((state) => state.setLanguage)
  const initializeConnection = useConnectionStore((state) => state.initialize)
  const status = useConnectionStore((state) => state.status)

  // Initialize connection when mode is selected
  useEffect(() => {
    if (selectedMode && status === 'disconnected') {
      initializeConnection()
    }
  }, [selectedMode, status, initializeConnection])

  const handleModeSelect = (mode: 'video' | 'audio' | 'text') => {
    setSelectedMode(mode)
  }

  const handleDisconnect = () => {
    setSelectedMode(null)
    setShowLanguageSelect(false)
  }

  // Show language selector if requested
  if (showLanguageSelect) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1B3A57] via-[#0F2E4D] to-[#FF6B35] flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-12">
            <div className="inline-block bg-white rounded-2xl px-8 py-6 mb-6 shadow-2xl">
              <img src="/verbyflow-logo.png" alt="VerbyFlow" className="h-28 w-auto" />
            </div>
            <h1 className="text-4xl font-bold font-display text-white mb-4">Choose Your Language</h1>
            <p className="text-xl text-white/90">Select the language you'll be speaking</p>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code)
                    setShowLanguageSelect(false)
                  }}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    language === lang.code
                      ? 'border-[#FF6B35] bg-[#FF6B35] text-white'
                      : 'border-gray-200 hover:border-[#FF6B35] hover:bg-[#FF6B35]/10'
                  }`}
                >
                  <Globe size={24} className="mx-auto mb-2" />
                  <p className="font-medium">{lang.name}</p>
                </button>
              ))}
            </div>
            
            <button
              onClick={() => setShowLanguageSelect(false)}
              className="w-full bg-[#1B3A57] hover:bg-[#0F2E4D] text-white py-3 rounded-xl font-semibold transition-colors"
            >
              Continue
            </button>
          </div>

          <div className="text-center mt-6">
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

  // Show mode selector if no mode selected
  if (!selectedMode) {
    return (
      <div>
        <ModeSelector onModeSelect={handleModeSelect} />
        
        {/* Language selector button (floating) */}
        <div className="fixed bottom-8 right-8">
          <button
            onClick={() => setShowLanguageSelect(true)}
            className="bg-white hover:bg-gray-50 text-[#1B3A57] px-6 py-3 rounded-full shadow-xl flex items-center space-x-2 transition-all hover:scale-105"
          >
            <Globe size={20} />
            <span className="font-medium">
              {LANGUAGES.find(l => l.code === language)?.name || 'English'}
            </span>
          </button>
        </div>
      </div>
    )
  }

  // Render appropriate interface based on selected mode
  return (
    <div className="min-h-screen">
      {selectedMode === 'video' && (
        <VideoCallInterface
          language={language}
          onDisconnect={handleDisconnect}
        />
      )}
      
      {selectedMode === 'audio' && (
        <AudioCallInterface
          language={language}
          onDisconnect={handleDisconnect}
        />
      )}
      
      {selectedMode === 'text' && (
        <TextChatInterface
          language={language}
          onDisconnect={handleDisconnect}
        />
      )}
    </div>
  )
}
