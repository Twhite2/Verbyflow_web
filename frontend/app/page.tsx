'use client'

import { useEffect } from 'react'
import ChatInterface from '@/components/ChatInterface'
import { useConnectionStore } from '@/lib/store'

export default function Home() {
  const initializeConnection = useConnectionStore((state) => state.initialize)

  useEffect(() => {
    initializeConnection()
  }, [initializeConnection])

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">
            VerbyFlow
          </h1>
          <p className="text-xl text-white/90">
            Connect beyond language barriers
          </p>
        </header>
        
        <ChatInterface />
      </div>
    </main>
  )
}
