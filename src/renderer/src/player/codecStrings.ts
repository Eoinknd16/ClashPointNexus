import type { VideoCodecInfo } from '@shared/playerConstants'

// We always transcode audio to AAC-LC stereo, so this half never varies.
const AUDIO_CODEC = 'mp4a.40.2'

const H264_PROFILE_IDC: Record<string, number> = {
  Baseline: 0x42,
  'Constrained Baseline': 0x42,
  Main: 0x4d,
  Extended: 0x58,
  High: 0x64,
  'High 10': 0x6e,
  'High 4:2:2': 0x7a,
  'High 4:4:4 Predictive': 0xf4
}

const HEVC_PROFILE_IDC: Record<string, number> = {
  Main: 1,
  'Main 10': 2,
  'Main Still Picture': 3,
  Rext: 4,
  'Format Range Extensions': 4
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0')
}

/**
 * Builds candidate video codec strings for the MSE mimeType's `codecs` parameter.
 * H.264's profile_idc/level_idc encoding is simple and unambiguous. HEVC's
 * "general_profile_compatibility_flags" shorthand is not — real-world codec
 * strings for the same profile vary depending on which convention a given
 * encoder/muxer used, and I have no way to test against Chromium's actual
 * parser from here. So rather than committing to one guessed string, this
 * returns several plausible candidates; buildMseCodecString below asks the
 * browser itself (MediaSource.isTypeSupported) which one it actually accepts.
 */
function videoCodecCandidates(codec: VideoCodecInfo): string[] {
  const { name, profile, level } = codec
  if (!profile || level === null) return []

  if (name === 'h264') {
    const profileIdc = H264_PROFILE_IDC[profile]
    if (profileIdc === undefined) return []
    return [`avc1.${hex2(profileIdc)}00${hex2(level)}`]
  }

  if (name === 'hevc') {
    const profileIdc = HEVC_PROFILE_IDC[profile]
    if (profileIdc === undefined) return []
    const compatibilityCandidates = ['1', '2', '4', '6', '0']
    const candidates: string[] = []
    for (const prefix of ['hev1', 'hvc1']) {
      for (const compat of compatibilityCandidates) {
        candidates.push(`${prefix}.${profileIdc}.${compat}.L${level}.B0`)
      }
    }
    return candidates
  }

  return []
}

/** Returns a full MSE mimeType string the browser confirms it supports, or null if none of our candidates work. */
export function buildMseCodecString(videoCodec: VideoCodecInfo | null): string | null {
  if (!videoCodec || typeof MediaSource === 'undefined') return null

  for (const videoCodecStr of videoCodecCandidates(videoCodec)) {
    const mimeType = `video/mp4; codecs="${videoCodecStr}, ${AUDIO_CODEC}"`
    if (MediaSource.isTypeSupported(mimeType)) return mimeType
  }

  return null
}
