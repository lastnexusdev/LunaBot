/**
 * audioDevices.js – Audio Device Enumeration & Stream Helpers
 */

/**
 * Request microphone permission (if possible) then return audio devices
 * (both inputs and outputs) so the UI can present call-source options
 * like virtual chat mixers.
 *
 * @returns {Promise<MediaDeviceInfo[]>}
 */
export async function getAudioDevices() {
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tempStream.getTracks().forEach((t) => t.stop());
  } catch {
    // Continue; labels may be blank until permission is granted.
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput');
}

/**
 * Open a MediaStream from a specific audio input device.
 *
 * @param {string} deviceId
 * @returns {Promise<MediaStream>}
 */
export async function openAudioInputStream(deviceId) {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
}

/**
 * Fallback path for selecting an audiooutput device: capture system audio
 * through display capture (Electron/Chromium prompt), then keep only audio.
 *
 * @returns {Promise<MediaStream>}
 */
async function openSystemAudioFallbackStream() {
  const displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });

  const audioTracks = displayStream.getAudioTracks();
  displayStream.getVideoTracks().forEach((t) => t.stop());

  if (!audioTracks.length) {
    throw new Error('System audio capture returned no audio track.');
  }

  return new MediaStream(audioTracks);
}

/**
 * Open the selected call-audio device.
 * - audioinput: direct getUserMedia by deviceId
 * - audiooutput: try direct capture first; if unsupported, fallback to
 *   system audio capture via getDisplayMedia.
 *
 * @param {MediaDeviceInfo} device
 * @returns {Promise<MediaStream>}
 */
export async function openCallAudioStream(device) {
  if (!device) {
    throw new Error('No call-audio device selected.');
  }

  try {
    return await openAudioInputStream(device.deviceId);
  } catch (err) {
    if (device.kind !== 'audiooutput') {
      throw err;
    }

    return openSystemAudioFallbackStream();
  }
}
