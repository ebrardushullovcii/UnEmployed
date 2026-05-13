import { useState } from 'react'
import { Mic, Monitor } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

type ProbeStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'failed'

function describeStatus(status: ProbeStatus, detail: string) {
  if (status === 'idle') {
    return detail
  }

  return `${status}: ${detail}`
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

export function InterviewMediaStreamProbes() {
  const [microphoneStatus, setMicrophoneStatus] = useState<ProbeStatus>('idle')
  const [microphoneDetail, setMicrophoneDetail] = useState('Not checked in this renderer.')
  const [displayStatus, setDisplayStatus] = useState<ProbeStatus>('idle')
  const [displayDetail, setDisplayDetail] = useState('Not checked in this renderer.')

  async function checkMicrophoneStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneStatus('unavailable')
      setMicrophoneDetail('navigator.mediaDevices.getUserMedia is unavailable.')
      return
    }

    setMicrophoneStatus('checking')
    setMicrophoneDetail('Requesting a temporary microphone stream.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const audioTracks = stream.getAudioTracks()
      setMicrophoneStatus(audioTracks.length > 0 ? 'available' : 'unavailable')
      setMicrophoneDetail(
        audioTracks.length > 0
          ? `Temporary microphone stream opened with ${audioTracks.length} audio track${audioTracks.length === 1 ? '' : 's'} and was immediately stopped.`
          : 'Temporary microphone stream opened without audio tracks.',
      )
      stopStream(stream)
    } catch (error) {
      setMicrophoneStatus('failed')
      setMicrophoneDetail(error instanceof Error ? error.message : 'Microphone stream check failed.')
    }
  }

  async function checkDisplayAudioStream() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setDisplayStatus('unavailable')
      setDisplayDetail('navigator.mediaDevices.getDisplayMedia is unavailable.')
      return
    }

    setDisplayStatus('checking')
    setDisplayDetail('Requesting a temporary screen/system audio stream.')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      })
      const audioTracks = stream.getAudioTracks()
      setDisplayStatus(audioTracks.length > 0 ? 'available' : 'unavailable')
      setDisplayDetail(
        audioTracks.length > 0
          ? `Temporary display stream exposed ${audioTracks.length} audio track${audioTracks.length === 1 ? '' : 's'} and was immediately stopped.`
          : 'Display capture completed, but no system audio track was exposed.',
      )
      stopStream(stream)
    } catch (error) {
      setDisplayStatus('failed')
      setDisplayDetail(error instanceof Error ? error.message : 'Display/system audio stream check failed.')
    }
  }

  return (
    <div className="grid gap-2 rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
      <div className="grid gap-1">
        <p className="text-[0.82rem]">Media stream probes</p>
        <p className="text-[0.72rem] leading-5 text-muted-foreground">
          Temporary checks stop their streams immediately and do not retain raw audio.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          disabled={microphoneStatus === 'checking'}
          onClick={() => { void checkMicrophoneStream() }}
          pending={microphoneStatus === 'checking'}
          size="compact"
          variant="secondary"
        >
          <Mic className="size-4" />
          Check mic
        </Button>
        <Button
          disabled={displayStatus === 'checking'}
          onClick={() => { void checkDisplayAudioStream() }}
          pending={displayStatus === 'checking'}
          size="compact"
          variant="secondary"
        >
          <Monitor className="size-4" />
          Check system
        </Button>
      </div>
      <div className="grid gap-1 text-[0.72rem] leading-5 text-muted-foreground">
        <p>{describeStatus(microphoneStatus, microphoneDetail)}</p>
        <p>{describeStatus(displayStatus, displayDetail)}</p>
      </div>
    </div>
  )
}
