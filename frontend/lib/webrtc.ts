/**
 * WebRTC Manager for Video Calls
 * Handles peer connections, media streams, and ICE candidates
 */

export interface WebRTCConfig {
  iceServers: RTCIceServer[]
}

export interface MediaStreamCallbacks {
  onLocalStream?: (stream: MediaStream) => void
  onRemoteStream?: (stream: MediaStream) => void
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void
  onIceCandidate?: (candidate: RTCIceCandidate) => void
}

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private callbacks: MediaStreamCallbacks = {}
  private config: WebRTCConfig

  constructor(config?: Partial<WebRTCConfig>, callbacks?: MediaStreamCallbacks) {
    this.config = {
      iceServers: config?.iceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    }
    this.callbacks = callbacks || {}
  }

  /**
   * Initialize local media stream (camera + microphone)
   */
  async initLocalStream(
    videoConstraints: MediaTrackConstraints = { width: 1280, height: 720 },
    audioConstraints: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true }
  ): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints,
      })

      console.log('✅ Local media stream initialized:', {
        videoTracks: this.localStream.getVideoTracks().length,
        audioTracks: this.localStream.getAudioTracks().length,
      })

      if (this.callbacks.onLocalStream) {
        this.callbacks.onLocalStream(this.localStream)
      }

      return this.localStream
    } catch (error) {
      console.error('❌ Failed to get local media stream:', error)
      throw error
    }
  }

  /**
   * Create a new peer connection
   */
  createPeerConnection(): RTCPeerConnection {
    if (this.peerConnection) {
      console.warn('Peer connection already exists, closing old one')
      this.closePeerConnection()
    }

    this.peerConnection = new RTCPeerConnection(this.config)

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 New ICE candidate:', event.candidate.type)
        if (this.callbacks.onIceCandidate) {
          this.callbacks.onIceCandidate(event.candidate)
        }
      }
    }

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState
      console.log('🔄 Connection state changed:', state)
      if (this.callbacks.onConnectionStateChange && state) {
        this.callbacks.onConnectionStateChange(state)
      }
    }

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('📹 Remote track received:', event.track.kind)
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream()
      }
      this.remoteStream.addTrack(event.track)

      if (this.callbacks.onRemoteStream) {
        this.callbacks.onRemoteStream(this.remoteStream)
      }
    }

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        if (this.peerConnection && this.localStream) {
          this.peerConnection.addTrack(track, this.localStream)
          console.log('➕ Added local track:', track.kind)
        }
      })
    }

    console.log('✅ Peer connection created')
    return this.peerConnection
  }

  /**
   * Create an offer (caller side)
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized')
    }

    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })

      await this.peerConnection.setLocalDescription(offer)
      console.log('✅ Offer created and set as local description')

      return offer
    } catch (error) {
      console.error('❌ Failed to create offer:', error)
      throw error
    }
  }

  /**
   * Create an answer (callee side)
   */
  async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized')
    }

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
      console.log('✅ Remote offer set')

      const answer = await this.peerConnection.createAnswer()
      await this.peerConnection.setLocalDescription(answer)
      console.log('✅ Answer created and set as local description')

      return answer
    } catch (error) {
      console.error('❌ Failed to create answer:', error)
      throw error
    }
  }

  /**
   * Set remote answer (caller side)
   */
  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized')
    }

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
      console.log('✅ Remote answer set')
    } catch (error) {
      console.error('❌ Failed to set remote answer:', error)
      throw error
    }
  }

  /**
   * Add ICE candidate received from remote peer
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      console.warn('Peer connection not ready, ignoring ICE candidate')
      return
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      console.log('✅ ICE candidate added')
    } catch (error) {
      console.error('❌ Failed to add ICE candidate:', error)
    }
  }

  /**
   * Toggle local video track
   */
  toggleVideo(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled
      })
      console.log(`📹 Video ${enabled ? 'enabled' : 'disabled'}`)
    }
  }

  /**
   * Toggle local audio track
   */
  toggleAudio(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled
      })
      console.log(`🎤 Audio ${enabled ? 'enabled' : 'disabled'}`)
    }
  }

  /**
   * Get connection statistics
   */
  async getStats(): Promise<RTCStatsReport | null> {
    if (!this.peerConnection) {
      return null
    }

    try {
      const stats = await this.peerConnection.getStats()
      return stats
    } catch (error) {
      console.error('❌ Failed to get stats:', error)
      return null
    }
  }

  /**
   * Close peer connection and stop all streams
   */
  closePeerConnection(): void {
    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
      console.log('🔌 Peer connection closed')
    }
  }

  /**
   * Stop local media stream
   */
  stopLocalStream(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop()
      })
      this.localStream = null
      console.log('🛑 Local stream stopped')
    }
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    this.closePeerConnection()
    this.stopLocalStream()
    this.remoteStream = null
    console.log('🧹 WebRTC cleanup complete')
  }

  /**
   * Get current connection state
   */
  getConnectionState(): RTCPeerConnectionState | null {
    return this.peerConnection?.connectionState || null
  }

  /**
   * Get local stream
   */
  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  /**
   * Get remote stream
   */
  getRemoteStream(): MediaStream | null {
    return this.remoteStream
  }
}
