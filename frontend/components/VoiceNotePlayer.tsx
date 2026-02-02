'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'

interface VoiceNotePlayerProps {
  audioData: string
  isOwn: boolean
}

export default function VoiceNotePlayer({ audioData, isOwn }: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animationRef = useRef<number>()

  useEffect(() => {
    const audio = new Audio(`data:audio/webm;base64,${audioData}`)
    audioRef.current = audio

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration)
    })

    audio.addEventListener('ended', () => {
      setIsPlaying(false)
      setCurrentTime(0)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    })

    return () => {
      audio.pause()
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [audioData])

  const togglePlayPause = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    } else {
      audio.play()
      updateProgress()
    }
    setIsPlaying(!isPlaying)
  }

  const updateProgress = () => {
    const audio = audioRef.current
    if (!audio) return

    setCurrentTime(audio.currentTime)
    if (!audio.paused) {
      animationRef.current = requestAnimationFrame(updateProgress)
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex items-center space-x-3 min-w-[200px]">
      <button
        onClick={togglePlayPause}
        className={`p-2 rounded-full ${
          isOwn 
            ? 'bg-white/20 hover:bg-white/30' 
            : 'bg-gray-200 hover:bg-gray-300'
        } transition-colors`}
      >
        {isPlaying ? (
          <Pause size={16} className={isOwn ? 'text-white' : 'text-gray-900'} />
        ) : (
          <Play size={16} className={isOwn ? 'text-white' : 'text-gray-900'} />
        )}
      </button>
      
      <div className="flex-1">
        <div className={`h-1 rounded-full ${isOwn ? 'bg-white/20' : 'bg-gray-200'} overflow-hidden`}>
          <div 
            className={`h-full ${isOwn ? 'bg-white' : 'bg-[#FF6B35]'} transition-all`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={`flex justify-between text-xs mt-1 ${isOwn ? 'text-white/70' : 'text-gray-500'}`}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}
